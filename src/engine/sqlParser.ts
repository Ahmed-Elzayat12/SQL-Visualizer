import { tokenizeSql, isKeyword, relationAfter, sourceRelations } from './sqlTokens';
import type {
  CteNode,
  LogicalOperation,
  ParsedSqlQuery,
  SqlColumn,
  SqlJoin,
  ColumnLineageItem,
} from '../types/sql';

/**
 * Robust PostgreSQL Query Parser & Semantic Analyzer.
 * Parses CTEs, relational operations, column projections, joins,
 * DISTINCT ON, aggregate FILTERs, and tracks column lineages.
 */
export function parseSqlQuery(rawSql: string): ParsedSqlQuery {
  const cleanSql = rawSql.slice(tokenizeSql(rawSql)[0]?.start ?? 0).trim();
  const ctes: CteNode[] = [];
  const sourceTables = new Set<string>();
  const allOperations: LogicalOperation[] = [];
  const columnLineage: ColumnLineageItem[] = [];
  const parseErrors: string[] = [];
  const syntaxLimitations: string[] = [];

  try {
    // 1. Detect CTEs (Common Table Expressions)
    let finalSelectSql = cleanSql;
    let cteDefinitionsString = '';
    const withMatch = cleanSql.match(/^WITH\s+(?:RECURSIVE\s+)?/i);
    if (withMatch) {
      const mainSelect = tokenizeSql(cleanSql).find(token => token.depth === 0 && isKeyword(token, 'SELECT'));
      if (mainSelect) {
        cteDefinitionsString = cleanSql.slice(withMatch[0].length, mainSelect.start).trim();
        finalSelectSql = cleanSql.slice(mainSelect.start);
      } else {
        parseErrors.push('WITH contains no final SELECT. Add a final SELECT or paste a CTE fragment for automatic completion.');
      }
    }

    // Parse individual CTEs
    if (cteDefinitionsString) {
      const parsedCtes = splitCteDefinitions(cteDefinitionsString);
      const registeredCteNames = new Set<string>();

      for (const rawCte of parsedCtes) {
        registeredCteNames.add(rawCte.name.toLowerCase());
      }

      for (const rawCte of parsedCtes) {
        const cteNode = analyzeCteBlock(rawCte.name, rawCte.body, rawCte.isMaterialized, registeredCteNames);
        ctes.push(cteNode);

        // Collect physical source tables (dependencies that are not other CTEs)
        for (const dep of cteNode.dependencies) {
          if (!registeredCteNames.has(dep.toLowerCase())) {
            sourceTables.add(dep);
          }
        }

        allOperations.push(...cteNode.operations);
      }
    }

    // 2. Parse Final Query
    const finalOps = analyzeQueryOperations('final_output', finalSelectSql, new Set(ctes.map(c => c.name.toLowerCase())));
    allOperations.push(...finalOps.operations);

    for (const dep of finalOps.dependencies) {
      if (!ctes.some(c => c.name.toLowerCase() === dep.toLowerCase())) {
        sourceTables.add(dep);
      }
    }

    const tokens = tokenizeSql(cleanSql);
    if (tokens.some(token => isKeyword(token, 'UNION'))) syntaxLimitations.push('UNION branches are shown structurally; sample row execution is not supported.');
    if (tokens.some(token => isKeyword(token, 'LATERAL'))) syntaxLimitations.push('LATERAL subqueries are shown structurally; sample row execution is not supported.');

    // 3. Compute Column Lineage
    buildColumnLineage(ctes, finalOps.outputColumns, columnLineage);

    return {
      rawSql,
      sourceTables: Array.from(sourceTables),
      ctes,
      finalQuery: {
        from: finalOps.dependencies,
        operations: finalOps.operations,
        outputColumns: finalOps.outputColumns,
      },
      allOperations,
      columnLineage,
      parseErrors,
      syntaxLimitations,
    };
  } catch (err: any) {
    parseErrors.push(err.message || 'Error parsing SQL query');
    return {
      rawSql,
      sourceTables: Array.from(sourceTables),
      ctes,
      finalQuery: {
        from: [],
        operations: [],
        outputColumns: [],
      },
      allOperations,
      columnLineage,
      parseErrors,
      syntaxLimitations,
    };
  }
}

/**
 * Splits the WITH ... clause into individual CTE definitions
 * handling nested parentheses carefully.
 */
function splitCteDefinitions(withClauseText: string): { name: string; body: string; isMaterialized?: boolean }[] {
  const results: { name: string; body: string; isMaterialized?: boolean }[] = [];
  const tokens = tokenizeSql(withClauseText);
  let headerStart = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.value !== '(' || token.depth !== 0) continue;
    const header = withClauseText.slice(headerStart, token.start).trim().replace(/^,\s*/, '');
    const match = header.match(/^([a-zA-Z_][a-zA-Z0-9_]*|"[^"]+")\s+AS(?:\s+(MATERIALIZED|NOT\s+MATERIALIZED))?$/i);
    if (!match) continue;
    const closeIndex = tokens.findIndex((candidate, index) => index > i && candidate.value === ')' && candidate.depth === 0);
    if (closeIndex < 0) break;
    const close = tokens[closeIndex];
    results.push({ name: match[1].replace(/^"|"$/g, ''), body: withClauseText.slice(token.end, close.start).trim(), isMaterialized: match[2] ? match[2].toUpperCase() === 'MATERIALIZED' : undefined });
    headerStart = close.end;
    i = closeIndex;
  }
  return results;
}

/**
 * Analyzes a CTE block and produces its logical relational operations.
 */
function analyzeCteBlock(
  cteName: string,
  cteSql: string,
  isMaterialized?: boolean,
  allCteNames: Set<string> = new Set()
): CteNode {
  const analysis = analyzeQueryOperations(cteName, cteSql, allCteNames, isMaterialized);

  return {
    name: cteName,
    isMaterialized,
    dependencies: analysis.dependencies,
    rawSql: cteSql,
    operations: analysis.operations,
    outputColumns: analysis.outputColumns,
    lineNumber: 1,
  };
}

/**
 * Deconstructs a SELECT statement into relational operations (Scan -> WHERE -> Aggregates -> Joins -> Projections)
 */
function analyzeQueryOperations(
  scopeName: string,
  sqlText: string,
  allCteNames: Set<string>,
  isMaterialized?: boolean
): {
  operations: LogicalOperation[];
  dependencies: string[];
  outputColumns: SqlColumn[];
} {
  const operations: LogicalOperation[] = [];
  const tokens = tokenizeSql(sqlText);
  const top = tokens.filter(token => token.depth === 0);
  const unions = top.filter(token => isKeyword(token, 'UNION'));
  if (unions.length) {
    let begin = 0;
    const branches: ReturnType<typeof analyzeQueryOperations>[] = [];
    for (const [index, union] of unions.entries()) {
      branches.push(analyzeQueryOperations(`${scopeName}_branch_${index + 1}`, sqlText.slice(begin, union.start), allCteNames));
      const next = top[top.indexOf(union) + 1];
      begin = next && isKeyword(next, 'ALL') ? next.end : union.end;
    }
    branches.push(analyzeQueryOperations(`${scopeName}_branch_${branches.length + 1}`, sqlText.slice(begin), allCteNames));
    const dependencies = [...new Set(branches.flatMap(branch => branch.dependencies))];
    const outputColumns = branches[0].outputColumns;
    const all = unions.every(union => isKeyword(top[top.indexOf(union) + 1], 'ALL'));
    return {
      dependencies, outputColumns,
      operations: [
        ...branches.flatMap(branch => branch.operations.map(op => ({ ...op, cteName: scopeName }))),
        { id: `${scopeName}_union`, cteName: scopeName, type: 'UNION_ALL', title: all ? 'UNION ALL: combine branches' : 'UNION: combine distinct rows',
          titleAr: all ? 'دمج الفروع UNION ALL' : 'دمج الصفوف بدون تكرار UNION', sqlSnippet: all ? 'UNION ALL' : 'UNION',
          descriptionEn: all ? 'Combines rows from separate SELECT branches, preserving duplicates.' : 'Combines rows from separate SELECT branches and removes duplicates.',
          descriptionAr: all ? 'بيجمع صفوف الفروع مع الاحتفاظ بالتكرار.' : 'بيجمع صفوف الفروع وبيشيل التكرار.',
          inputs: dependencies, inputOperationIds: branches.flatMap(branch => branch.operations.at(-1)?.id ?? []), outputColumns, performanceTips: [], sqlConceptNotes: [] },
      ],
    };
  }
  const dependencies = sourceRelations(tokens);
  const fromToken = top.find(token => isKeyword(token, 'FROM'));
  const primaryTable = fromToken ? relationAfter(tokens, tokens.indexOf(fromToken)) ?? '' : '';
  const joins: SqlJoin[] = [];
  const lateralSql: string[] = [];
  const stopWords = ['WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'WINDOW', 'JOIN'];
  for (let i = 0; i < top.length; i++) {
    if (!isKeyword(top[i], 'JOIN')) continue;
    const next = top[i + 1];
    const typeRaw = top[i - 1]?.value.toUpperCase();
    const type = (['LEFT', 'RIGHT', 'FULL', 'CROSS'].includes(typeRaw) ? typeRaw : 'INNER') as SqlJoin['type'];
    const endToken = top.slice(i + 2).find(token => stopWords.some(word => isKeyword(token, word)));
    if (next && isKeyword(next, 'LATERAL')) {
      lateralSql.push(sqlText.slice(top[i].start, endToken?.start ?? sqlText.length).trim());
      continue;
    }
    const table = relationAfter(tokens, tokens.indexOf(top[i]));
    if (!table) continue;
    const on = top.slice(i + 2).find(token => isKeyword(token, 'ON') && token.start < (endToken?.start ?? Infinity));
    joins.push({ type, table, onCondition: on ? sqlText.slice(on.end, endToken?.start ?? sqlText.length).trim() : undefined });
  }
  const clause = (name: string, second?: string) => {
    const index = top.findIndex((token, i) => isKeyword(token, name) && (!second || top[i + 1] && isKeyword(top[i + 1], second)));
    if (index < 0) return undefined;
    const first = top[index + (second ? 1 : 0)];
    const end = top.slice(index + (second ? 2 : 1)).find(token => ['WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'WINDOW'].some(word => isKeyword(token, word)));
    return sqlText.slice(first.end, end?.start ?? sqlText.length).trim().replace(/;$/, '');
  };
  const whereCondition = clause('WHERE');
  const distinctOnMatch = sqlText.match(/SELECT\s+DISTINCT\s+ON\s*\(([\s\S]*?)\)/i);
  const distinctOnExpr = distinctOnMatch ? distinctOnMatch[1].trim() : undefined;
  const groupByClause = clause('GROUP', 'BY');
  const orderByClause = clause('ORDER', 'BY');
  const selectToken = top.find(token => isKeyword(token, 'SELECT'));
  const selectClause = selectToken && fromToken ? sqlText.slice(selectToken.end, fromToken.start).trim().replace(/^DISTINCT(?:\s+ON\s*\([^)]*\))?\s+/i, '') : '*';
  const outputColumns = parseSelectColumns(selectClause, primaryTable);

  // --- BUILD LOGICAL OPERATIONS IN EXECUTION ORDER ---

  // 1. Source Scan
  if (primaryTable) {
    const isCteSource = allCteNames.has(primaryTable.toLowerCase());
    operations.push({
      id: `${scopeName}_scan_${primaryTable}`,
      cteName: scopeName,
      type: 'SOURCE_SCAN',
      title: isCteSource ? `Read CTE: ${primaryTable}` : `Table Scan: ${primaryTable}`,
      titleAr: isCteSource ? `قراءة الـ CTE: ${primaryTable}` : `فحص جدول المصدر: ${primaryTable}`,
      sqlSnippet: `FROM ${primaryTable}`,
      descriptionEn: isCteSource
        ? `Reads intermediate materialized rows previously computed by CTE '${primaryTable}'.`
        : `Scans source relation '${primaryTable}' to provide base records for this pipeline stage.`,
      descriptionAr: isCteSource
        ? `بيقرأ السجلات اللي اتحسبت وجهزت قبل كده في الـ CTE '${primaryTable}'.`
        : `بيعمل مسح لجدول المصدر '${primaryTable}' عشان يجيب السجلات الخام الأساسية للعملية.`,
      inputs: [primaryTable],
      outputColumns: outputColumns.filter(c => !c.isDerived && !c.isAggregate),
      performanceTips: [
        {
          category: 'SCAN',
          observation: isCteSource ? 'CTE In-Memory / Spooled Scan' : `Full relation scan on ${primaryTable}`,
          whyExpensive: 'Reading unindexed rows wastes I/O if only a few rows are needed.',
          investigation: `Check EXPLAIN to verify if an index scan or bitmap heap scan could be used.`,
          recommendation: `Check whether indexes on the filter columns improve the actual query plan.`,
        },
      ],
      sqlConceptNotes: [
        {
          title: 'PostgreSQL Relation Scanning',
          body: 'PostgreSQL evaluates FROM first to create the working dataset before applying filters or aggregations.',
        },
      ],
    });
  }

  lateralSql.forEach((snippet, index) => operations.push({
    id: `${scopeName}_lateral_${index}`, cteName: scopeName, type: 'LATERAL_JOIN',
    title: 'LATERAL: evaluate per-row subquery', titleAr: 'حساب القيم لكل صف LATERAL',
    sqlSnippet: snippet, descriptionEn: 'Calculates values from a correlated subquery for each source row (for example, usable).',
    descriptionAr: 'بيحسب قيم مرتبطة بأعمدة كل صف من المصدر، زي usable.',
    inputs: [primaryTable], outputColumns: [], performanceTips: [], sqlConceptNotes: [],
  }));

  // 2. WHERE Filter
  if (whereCondition) {
    operations.push({
      id: `${scopeName}_where`,
      cteName: scopeName,
      type: 'WHERE_FILTER',
      title: `Filter Rows (WHERE)`,
      titleAr: `فلترة السجلات (WHERE)`,
      sqlSnippet: `WHERE ${whereCondition}`,
      descriptionEn: `Applies predicate '${whereCondition}'. Only rows evaluating to TRUE are retained; FALSE and NULL rows are discarded.`,
      descriptionAr: `بيطبق شرط التصفية '${whereCondition}'. السطور اللي شرطها صح (TRUE) بس هي اللي بتكمل، وأي سطر نتيجته FALSE أو NULL بيتم استبعاده فوراً.`,
      inputs: [primaryTable],
      outputColumns,
      performanceTips: [
        {
          category: 'INDEX',
          observation: `Filtering condition on ${whereCondition}`,
          whyExpensive: 'PostgreSQL must inspect every row unless an index condition filters out blocks early.',
          investigation: 'Verify if predicates match index leading columns.',
          recommendation: 'Avoid functions on indexed columns (e.g. WHERE lower(col) = x prevents index usage unless expression index exists).',
        },
      ],
      sqlConceptNotes: [
        {
          title: 'Three-Valued Logic (3VL)',
          body: 'In SQL, NULL comparison results in UNKNOWN. WHERE filters require strictly TRUE; UNKNOWN rows are dropped.',
        },
      ],
    });
  }

  // 3. Derived Columns & CASE WHEN Expressions
  const derivedCols = outputColumns.filter(c => c.isDerived && !c.isAggregate);
  if (derivedCols.length > 0) {
    const hasCaseWhen = derivedCols.some(c => /CASE\s+WHEN/i.test(c.expression));
    operations.push({
      id: `${scopeName}_derived`,
      cteName: scopeName,
      type: hasCaseWhen ? 'CASE_WHEN' : 'DERIVED_COLUMNS',
      title: hasCaseWhen ? `Evaluate CASE WHEN & Expressions` : `Calculate Derived Columns`,
      titleAr: hasCaseWhen ? `حساب شروط CASE WHEN والعمليات الحسابية` : `حساب الأعمدة المشتقة`,
      sqlSnippet: derivedCols.map(c => `${c.expression} AS "${c.name}"`).join(',\n'),
      descriptionEn: `Computes calculated fields per row (${derivedCols.map(c => c.name).join(', ')}). Each row evaluates conditional logic or arithmetic.`,
      descriptionAr: `بيحسب الأعمدة المشتقة لكل سطر زي (${derivedCols.map(c => c.name).join(', ')}). كل سطر بيتقيم فيه الـ CASE WHEN أو العمليات الحسابية عشان نطلع بحالة أو قيمة جديدة.`,
      inputs: [primaryTable],
      outputColumns: derivedCols,
      performanceTips: [
        {
          category: 'CARDINALITY',
          observation: 'Row-by-row CPU computation',
          whyExpensive: 'Complex nested CASE expressions or timestamp arithmetic can add CPU latency across millions of rows.',
          investigation: 'Profile CPU time in EXPLAIN ANALYZE.',
          recommendation: 'Precalculate static flags or consider generated columns if queried frequently.',
        },
      ],
      sqlConceptNotes: [
        {
          title: 'CASE WHEN Short-Circuiting',
          body: 'PostgreSQL evaluates WHEN branches sequentially and short-circuits at the first TRUE match.',
        },
      ],
    });
  }

  // 4. GROUP BY & Aggregations (with Aggregate FILTER)
  if (groupByClause || outputColumns.some(c => c.isAggregate)) {
    const aggCols = outputColumns.filter(c => c.isAggregate);
    const hasFilterClause = aggCols.some(c => /FILTER\s*\(/i.test(c.expression));

    operations.push({
      id: `${scopeName}_group_by`,
      cteName: scopeName,
      type: 'GROUP_BY_AGGREGATE',
      title: groupByClause ? `GROUP BY (${groupByClause})` : `Aggregate All Rows`,
      titleAr: groupByClause ? `تجميع السجلات GROUP BY (${groupByClause})` : `تجميع كل السجلات في سطر واحد`,
      sqlSnippet: `${groupByClause ? `GROUP BY ${groupByClause}\n` : ''}${aggCols.map(c => `${c.expression} AS "${c.name}"`).join(',\n')}`,
      descriptionEn: `Groups candidate rows by key (${groupByClause || 'all'}). Computes aggregate values: ${aggCols.map(c => c.name).join(', ')}.${hasFilterClause ? ' Uses PostgreSQL aggregate FILTER clauses to count selectively.' : ''}`,
      descriptionAr: `بيجمع كل السطور اللي ليها نفس (${groupByClause || 'المفتاح'}) مع بعض في مجموعة واحدة. وبيحسب التجميعات زي: ${aggCols.map(c => c.name).join(', ')}.${hasFilterClause ? ' الميزة هنا إنه بيستخدم خاصية FILTER في PostgreSQL علشان يعد بس السجلات اللي مستوفية الشرط.' : ''}`,
      inputs: [primaryTable],
      outputColumns: outputColumns.filter(c => c.isAggregate || (groupByClause && groupByClause.includes(c.name))),
      performanceTips: [
        {
          category: 'MEMORY',
          observation: 'HashAggregate vs GroupAggregate',
          whyExpensive: 'If grouping sets exceed work_mem, PostgreSQL must spill hash tables to disk (temp files).',
          investigation: 'Look for "Disk: xxxkB" under HashAggregate in EXPLAIN (ANALYZE, BUFFERS).',
          recommendation: 'Increase work_mem or provide pre-sorted index on grouping columns.',
        },
      ],
      sqlConceptNotes: [
        {
          title: 'PostgreSQL Aggregate FILTER Clause',
          body: 'COUNT(*) FILTER (WHERE condition) is more efficient and standard SQL than SUM(CASE WHEN condition THEN 1 ELSE 0 END).',
        },
      ],
    });
  }

  // 5. DISTINCT ON
  if (distinctOnExpr) {
    operations.push({
      id: `${scopeName}_distinct_on`,
      cteName: scopeName,
      type: 'DISTINCT_ON',
      title: `DISTINCT ON (${distinctOnExpr})`,
      titleAr: `اختيار أول سجل فريد DISTINCT ON (${distinctOnExpr})`,
      sqlSnippet: `SELECT DISTINCT ON (${distinctOnExpr})\nORDER BY ${orderByClause || distinctOnExpr}`,
      descriptionEn: `Keeps only the first row for each unique set of values in (${distinctOnExpr}) according to ORDER BY (${orderByClause || 'default'}). Subsequent rows are discarded.`,
      descriptionAr: `بيختار أول سطر فريد بس لكل قيمة في (${distinctOnExpr}) بناءً على ترتيب الـ ORDER BY (${orderByClause || 'الافتراضي'}). السجلات المكررة الباقية بتتساقط وتتحذف.`,
      inputs: [primaryTable],
      outputColumns,
      performanceTips: [
        {
          category: 'ORDER',
          observation: 'Requires Sorting by DISTINCT ON expressions first',
          whyExpensive: 'PostgreSQL must sort all input rows before picking the first one.',
          investigation: 'Verify if ORDER BY starts with the DISTINCT ON columns.',
          recommendation: 'Consider a compound index matching the DISTINCT ON and ORDER BY columns.',
        },
      ],
      sqlConceptNotes: [
        {
          title: 'PostgreSQL DISTINCT ON Feature',
          body: 'Unlike standard SQL DISTINCT which checks all columns, DISTINCT ON (a, b) deduplicates only on specific keys and picks the top row according to ORDER BY.',
        },
      ],
    });
  }

  // 6. JOIN operations
  for (const join of joins) {
    operations.push({
      id: `${scopeName}_join_${join.table}`,
      cteName: scopeName,
      type: 'JOIN',
      title: `${join.type} JOIN ${join.table}`,
      titleAr: `دمج الجداول ${join.type} JOIN مع ${join.table}`,
      sqlSnippet: `${join.type} JOIN ${join.table} ON ${join.onCondition || 'TRUE'}`,
      descriptionEn: `${join.type} joins '${primaryTable}' with '${join.table}' on predicate '${join.onCondition}'. ${join.type === 'LEFT' ? 'Preserves all left rows, filling missing right columns with NULL.' : 'Retains only matching rows from both sides.'}`,
      descriptionAr: `بيعمل دمج نوعه ${join.type} بين '${primaryTable}' و '${join.table}' بالشرط '${join.onCondition}'. ${join.type === 'LEFT' ? 'بيحافظ على كل سطور الجدول الشمال حتى لو ملهاش مقابل على اليمين، وبيحط مكانها NULL.' : 'بيحتفظ بس بالسطور اللي ليها تطابق حقيقي في الجانبين.'}`,
      inputs: [primaryTable, join.table],
      outputColumns,
      performanceTips: [
        {
          category: 'INDEX',
          observation: `Join condition on ${join.onCondition}`,
          whyExpensive: 'Nested loop joins without indexes on foreign keys cause O(N*M) table rescanning.',
          investigation: 'Look for Hash Join vs Nested Loop in EXPLAIN.',
          recommendation: `Ensure join columns in ${join.table} are indexed.`,
        },
      ],
      sqlConceptNotes: [
        {
          title: 'PostgreSQL Join Strategies',
          body: 'PostgreSQL optimizer chooses between Hash Join (in-memory hash table), Merge Join (both sides sorted), and Nested Loop (small outer, indexed inner).',
        },
      ],
    });
  }

  // 7. ORDER BY & LIMIT (if at CTE or main query level)
  if (orderByClause && !distinctOnExpr) {
    operations.push({
      id: `${scopeName}_order_by`,
      cteName: scopeName,
      type: 'ORDER_BY',
      title: `Sort Result (ORDER BY)`,
      titleAr: `ترتيب النتائج (ORDER BY)`,
      sqlSnippet: `ORDER BY ${orderByClause}`,
      descriptionEn: `Sorts the resulting rows by (${orderByClause}).`,
      descriptionAr: `بيرتب السطور الناتجة حسب (${orderByClause}) تصاعدياً أو تنازلياً.`,
      inputs: [primaryTable],
      outputColumns,
      performanceTips: [
        {
          category: 'ORDER',
          observation: 'Sort method (quicksort vs external merge)',
          whyExpensive: 'Large sorts that exceed work_mem spill to disk.',
          investigation: 'Check "Sort Method: top-N heapsort" vs "external merge" in EXPLAIN.',
          recommendation: 'Add LIMIT if only top records are required; use index ordering.',
        },
      ],
      sqlConceptNotes: [
        {
          title: 'Top-N Sort Optimization',
          body: 'When combined with LIMIT, PostgreSQL keeps an in-memory priority queue instead of sorting the whole table.',
        },
      ],
    });
  }

  if (primaryTable) operations.push({
    id: `${scopeName}_output`, cteName: scopeName, type: 'FINAL_OUTPUT',
    title: 'Select output columns', titleAr: '\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0623\u0639\u0645\u062f\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629',
    sqlSnippet: `SELECT ${selectClause}`, inputs: [primaryTable], outputColumns,
    descriptionEn: 'Keeps the selected columns in the result.', descriptionAr: '\u0628\u064a\u062d\u062a\u0641\u0638 \u0628\u0627\u0644\u0623\u0639\u0645\u062f\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0641\u064a \u0627\u0644\u0646\u062a\u064a\u062c\u0629.',
    performanceTips: [], sqlConceptNotes: [],
  });

  return {
    operations: operations.map((op, index) => ({ ...op, inputOperationIds: index ? [operations[index - 1].id] : [] })),
    dependencies: Array.from(new Set(dependencies)),
    outputColumns,
  };
}

/**
 * Parses SELECT column expressions, names, aliases, and aggregates.
 */
function parseSelectColumns(selectClause: string, defaultTable?: string): SqlColumn[] {
  const columns: SqlColumn[] = [];
  const parts = splitCommas(selectClause);

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part === '*') {
      columns.push({
        name: '*',
        expression: '*',
        sourceTable: defaultTable,
      });
      continue;
    }

    // Match alias: expression AS "alias" or expression alias
    const aliasMatch = part.match(/([\s\S]+?)\s+(?:AS\s+)?([a-zA-Z0-9_"]+)$/i);
    let expression = part;
    let colName = part;

    if (aliasMatch && !part.endsWith(')')) {
      expression = aliasMatch[1].trim();
      colName = aliasMatch[2].replace(/"/g, '').trim();
    } else {
      // Direct column or expression without alias
      const dotMatch = part.match(/(?:[a-zA-Z0-9_"]+\.)?([a-zA-Z0-9_"]+)$/);
      if (dotMatch) {
        colName = dotMatch[1].replace(/"/g, '').trim();
      }
    }

    const isAggregate = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(expression);
    const isDerived = isAggregate || /CASE\s+WHEN|[\+\-\*\/\>\|\<\=]|EXTRACT|COALESCE|JSONB_/i.test(expression);

    // Extract table prefix if present (e.g. t.vehicleId)
    const tablePrefixMatch = expression.match(/([a-zA-Z0-9_"]+)\.([a-zA-Z0-9_"]+)/);
    const sourceTable = tablePrefixMatch ? tablePrefixMatch[1].replace(/"/g, '') : defaultTable;
    const sourceColumn = tablePrefixMatch ? tablePrefixMatch[2].replace(/"/g, '') : colName;

    columns.push({
      name: colName,
      expression,
      alias: colName,
      isDerived,
      isAggregate,
      sourceTable,
      sourceColumn,
    });
  }

  return columns;
}

/**
 * Splits comma-separated items while respecting parentheses and quotes.
 */
function splitCommas(text: string): string[] {
  const items: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "'" && text[i - 1] !== '\\') {
      inString = !inString;
    }
    if (!inString) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        items.push(current);
        current = '';
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) {
    items.push(current);
  }
  return items;
}

/**
 * Constructs end-to-end column lineage from origin tables through CTEs to the final query.
 */
function buildColumnLineage(
  ctes: CteNode[],
  finalColumns: SqlColumn[],
  lineageResults: ColumnLineageItem[]
) {
  const cteColumnMap = new Map<string, SqlColumn[]>();
  for (const cte of ctes) {
    cteColumnMap.set(cte.name.toLowerCase(), cte.outputColumns);
  }

  for (const col of finalColumns) {
    let transformationType: ColumnLineageItem['transformationType'] = 'direct';
    if (col.isAggregate) transformationType = 'aggregate';
    else if (/CASE\s+WHEN/i.test(col.expression)) transformationType = 'conditional';
    else if (col.isDerived) transformationType = 'expression';

    lineageResults.push({
      targetColumn: col.name,
      targetCte: 'Final Result',
      originTable: col.sourceTable || 'unknown',
      originColumn: col.sourceColumn || col.name,
      transformationType,
      expression: col.expression,
    });
  }

  for (const cte of ctes) {
    for (const col of cte.outputColumns) {
      let transType: ColumnLineageItem['transformationType'] = 'direct';
      if (col.isAggregate) transType = 'aggregate';
      else if (/CASE\s+WHEN/i.test(col.expression)) transType = 'conditional';
      else if (col.isDerived) transType = 'expression';

      lineageResults.push({
        targetColumn: col.name,
        targetCte: cte.name,
        originTable: col.sourceTable || cte.dependencies[0] || 'source',
        originColumn: col.sourceColumn || col.name,
        transformationType: transType,
        expression: col.expression,
      });
    }
  }
}
