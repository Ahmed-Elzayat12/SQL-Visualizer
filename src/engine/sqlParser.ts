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
  const cleanSql = rawSql.trim();
  const ctes: CteNode[] = [];
  const sourceTables = new Set<string>();
  const allOperations: LogicalOperation[] = [];
  const columnLineage: ColumnLineageItem[] = [];
  const parseErrors: string[] = [];
  const syntaxLimitations: string[] = [];

  try {
    // 1. Detect CTEs (Common Table Expressions)
    const withMatch = cleanSql.match(/^WITH\s+(RECURSIVE\s+)?([\s\S]+?)\s+SELECT\b/i);

    let finalSelectSql = cleanSql;
    let cteDefinitionsString = '';

    if (withMatch) {
      cteDefinitionsString = withMatch[2];
      // Final query starts where WITH definition ends
      const mainSelectIndex = cleanSql.lastIndexOf('SELECT');
      if (mainSelectIndex !== -1) {
        finalSelectSql = cleanSql.slice(mainSelectIndex);
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
  let depth = 0;
  let inString = false;
  let currentHeader = '';
  let currentBody = '';
  let inBody = false;

  let i = 0;
  while (i < withClauseText.length) {
    const char = withClauseText[i];

    if (char === "'" && withClauseText[i - 1] !== '\\') {
      inString = !inString;
    }

    if (!inString) {
      if (!inBody) {
        if (char === '(') {
          // Check if previous characters had 'AS' or 'AS MATERIALIZED'
          const asMatch = currentHeader.match(/(\w+)\s+AS(?:\s+(MATERIALIZED|NOT\s+MATERIALIZED))?\s*$/i);
          if (asMatch) {
            inBody = true;
            depth = 1;
            i++;
            continue;
          }
        }
        currentHeader += char;
      } else {
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth === 0) {
            // End of this CTE body!
            const headerMatch = currentHeader.match(/(\w+)\s+AS(?:\s+(MATERIALIZED|NOT\s+MATERIALIZED))?\s*$/i);
            const cteName = headerMatch ? headerMatch[1].trim() : `cte_${results.length + 1}`;
            const isMat = headerMatch && headerMatch[2] ? headerMatch[2].toUpperCase().includes('MATERIALIZED') && !headerMatch[2].toUpperCase().includes('NOT') : undefined;

            results.push({
              name: cteName,
              body: currentBody.trim(),
              isMaterialized: isMat,
            });

            currentHeader = '';
            currentBody = '';
            inBody = false;

            // Skip trailing commas
            while (i + 1 < withClauseText.length && (withClauseText[i + 1] === ',' || /\s/.test(withClauseText[i + 1]))) {
              i++;
            }
            i++;
            continue;
          }
        }
        currentBody += char;
      }
    } else {
      if (inBody) {
        currentBody += char;
      } else {
        currentHeader += char;
      }
    }

    i++;
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
  const dependencies: string[] = [];

  // Extract FROM clause
  const fromMatch = sqlText.match(/FROM\s+([a-zA-Z0-9_"]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_"]+))?/i);
  const primaryTable = fromMatch ? fromMatch[1].replace(/"/g, '') : '';
  if (primaryTable) {
    dependencies.push(primaryTable);
  }

  // Extract JOIN clauses
  const joinRegex = /(INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?|CROSS\s+)?JOIN\s+([a-zA-Z0-9_"]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_"]+))?(?:\s+ON\s+([\s\S]*?)(?=(?:INNER|LEFT|RIGHT|FULL|CROSS|\bWHERE\b|\bGROUP\b|\bORDER\b|\bHAVING\b|\bLIMIT\b|$)))?/gi;
  let joinMatch: RegExpExecArray | null;
  const joins: SqlJoin[] = [];

  while ((joinMatch = joinRegex.exec(sqlText)) !== null) {
    const joinTypeRaw = (joinMatch[1] || 'INNER').trim().toUpperCase().replace(/\s+OUTER/, '');
    const joinType = (['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'].includes(joinTypeRaw)
      ? joinTypeRaw
      : 'INNER') as SqlJoin['type'];
    const joinedTable = joinMatch[2].replace(/"/g, '');
    const alias = joinMatch[3] ? joinMatch[3].replace(/"/g, '') : undefined;
    const onCondition = joinMatch[4] ? joinMatch[4].trim() : undefined;

    dependencies.push(joinedTable);
    joins.push({
      type: joinType,
      table: joinedTable,
      alias,
      onCondition,
    });
  }

  // Extract WHERE clause
  const whereMatch = sqlText.match(/\bWHERE\s+([\s\S]*?)(?=\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|\bWINDOW\b|$)/i);
  const whereCondition = whereMatch ? whereMatch[1].trim() : undefined;

  // Extract DISTINCT or DISTINCT ON
  const distinctOnMatch = sqlText.match(/SELECT\s+DISTINCT\s+ON\s*\(([\s\S]*?)\)/i);
  const distinctOnExpr = distinctOnMatch ? distinctOnMatch[1].trim() : undefined;
  const isDistinct = !distinctOnExpr && /SELECT\s+DISTINCT\b/i.test(sqlText);

  // Extract GROUP BY
  const groupByMatch = sqlText.match(/\bGROUP\s+BY\s+([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i);
  const groupByClause = groupByMatch ? groupByMatch[1].trim() : undefined;

  // Extract ORDER BY
  const orderByMatch = sqlText.match(/\bORDER\s+BY\s+([\s\S]*?)(?=\bLIMIT\b|\bOFFSET\b|$)/i);
  const orderByClause = orderByMatch ? orderByMatch[1].trim() : undefined;

  // Extract SELECT columns
  const selectMatch = sqlText.match(/SELECT(?:\s+DISTINCT(?:\s+ON\s*\([\s\S]*?\))?)?\s+([\s\S]*?)\s+FROM\b/i);
  const selectClause = selectMatch ? selectMatch[1].trim() : '*';
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
          recommendation: `Ensure filter columns (e.g. vehicleId, eventTime) have matching composite indexes.`,
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
          recommendation: 'Create a compound index: (vehicleId, eventTime DESC) to allow an Index Scan without sorting.',
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

  return {
    operations,
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
