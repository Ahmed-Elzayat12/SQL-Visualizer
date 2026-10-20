import { parse } from '@babel/parser';
import type { DynamicVariable, JsAnalysisResult } from '../types/ast';

/**
 * Analyzes JavaScript or TypeScript source code using Babel's AST parser.
 * Extracts embedded SQL queries, evaluates deterministic static expressions,
 * and isolates unresolved dynamic parameters.
 */
export function analyzeSourceCode(
  sourceCode: string,
  userOverrides: Record<string, string> = {}
): JsAnalysisResult {
  const trimmed = sourceCode.trim();

  // Quick check: If it begins with standard SQL commands without JS declarations, treat as Raw SQL
  const isLikelyRawSql = /^(WITH|SELECT|INSERT|UPDATE|DELETE|EXPLAIN|CREATE)\b/i.test(trimmed);
  if (isLikelyRawSql && !trimmed.includes('const ') && !trimmed.includes('class ') && !trimmed.includes('function ')) {
    // Check for positional parameters ($1, $2, etc.) in raw SQL
    const params: { index: number; name: string; value?: string }[] = [];
    const paramRegex = /\$([0-9]+)/g;
    let match: RegExpExecArray | null;
    const seenIndices = new Set<number>();
    while ((match = paramRegex.exec(trimmed)) !== null) {
      const idx = parseInt(match[1], 10);
      if (!seenIndices.has(idx)) {
        seenIndices.add(idx);
        params.push({
          index: idx,
          name: `$${idx}`,
          value: userOverrides[`$${idx}`] ?? undefined,
        });
      }
    }

    return {
      hasJsWrapper: false,
      extractedSql: trimmed,
      originalCode: sourceCode,
      variables: [],
      parameters: params,
      isFullyResolved: params.every(p => p.value !== undefined || !userOverrides),
      syntaxErrors: [],
      frameworkDetected: 'Raw SQL',
    };
  }

  // Detect Framework signatures
  let framework: JsAnalysisResult['frameworkDetected'] = 'Generic TS';
  if (sourceCode.includes('@Injectable') || sourceCode.includes('Repository') || sourceCode.includes('NestJS')) {
    framework = 'NestJS';
  } else if (sourceCode.includes('createQueryBuilder') || sourceCode.includes('dataSource.query') || sourceCode.includes('getRepository')) {
    framework = 'TypeORM';
  } else if (sourceCode.includes('client.query') || sourceCode.includes('pool.query')) {
    framework = 'pg';
  }

  const localConstants = new Map<string, string>();
  const localArrays = new Map<string, string[]>();
  const variables: DynamicVariable[] = [];
  const parameters: { index: number; name: string; value?: string }[] = [];
  const syntaxErrors: string[] = [];
  let candidateMethodName: string | undefined;
  let targetTemplateNode: any = null;

  try {
    const ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: [
        'typescript',
        ['decorators', { decoratorsBeforeExport: true }] as any,
      ],
      errorRecovery: true,
    });

    // Traverse AST
    function traverse(node: any) {
      if (!node || typeof node !== 'object') return;

      // Detect class methods
      if (node.type === 'ClassMethod' && node.key?.name) {
        candidateMethodName = node.key.name;
      }

      // Collect variable declarations: const valid = "pointCount > 0"
      if (node.type === 'VariableDeclarator' && node.id?.name && node.init) {
        const varName = node.id.name;
        if (node.init.type === 'StringLiteral') {
          localConstants.set(varName, node.init.value);
        } else if (node.init.type === 'NumericLiteral') {
          localConstants.set(varName, String(node.init.value));
        } else if (node.init.type === 'ArrayExpression') {
          const elements: string[] = [];
          for (const el of node.init.elements) {
            if (el?.type === 'StringLiteral') {
              elements.push(el.value);
            } else if (el?.type === 'Identifier' && localConstants.has(el.name)) {
              elements.push(localConstants.get(el.name)!);
            }
          }
          localArrays.set(varName, elements);
        }
      }

      // Detect TemplateLiteral containing SQL keywords
      if (node.type === 'TemplateLiteral') {
        const fullQuasiText = node.quasis.map((q: any) => q.value?.raw || '').join(' ');
        if (/SELECT|WITH|FROM|WHERE|INSERT|UPDATE/i.test(fullQuasiText)) {
          targetTemplateNode = node;
        }
      }

      // Recurse children
      for (const key of Object.keys(node)) {
        if (key !== 'parent' && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) {
            node[key].forEach(traverse);
          } else {
            traverse(node[key]);
          }
        }
      }
    }

    traverse(ast);
  } catch (err: any) {
    syntaxErrors.push(err.message || 'Error parsing JavaScript/TypeScript AST');
  }

  let extractedSql = '';
  let isFullyResolved = true;

  if (targetTemplateNode && targetTemplateNode.quasis) {
    const quasis = targetTemplateNode.quasis;
    const expressions = targetTemplateNode.expressions || [];

    for (let i = 0; i < quasis.length; i++) {
      extractedSql += quasis[i].value?.raw || '';

      if (i < expressions.length) {
        const expr = expressions[i];
        let spanText = '';

        if (expr.start !== undefined && expr.end !== undefined) {
          spanText = sourceCode.slice(expr.start, expr.end);
        } else if (expr.name) {
          spanText = expr.name;
        } else {
          spanText = `expr_${i}`;
        }

        let resolvedVal: string | undefined;
        let sourceType: DynamicVariable['sourceType'] = 'unknown';

        // Check user override
        if (userOverrides[spanText] !== undefined) {
          resolvedVal = userOverrides[spanText];
          sourceType = 'identifier';
        }
        // Check local constant
        else if (localConstants.has(spanText)) {
          resolvedVal = localConstants.get(spanText)!;
          sourceType = 'constant';
        }
        // Check array join e.g. predicates.join(' AND ')
        else if (spanText.includes('.join(')) {
          sourceType = 'predicate_array';
          const match = spanText.match(/(\w+)\.join\((['"])(.*?)\2\)/);
          if (match) {
            const arrName = match[1];
            const delimiter = match[3];
            if (localArrays.has(arrName)) {
              resolvedVal = localArrays.get(arrName)!.join(` ${delimiter} `);
            }
          }
        }
        // Identifier
        else if (expr.type === 'Identifier') {
          sourceType = 'identifier';
        }

        const isResolved = resolvedVal !== undefined;
        if (!isResolved) {
          isFullyResolved = false;
        }

        variables.push({
          name: spanText,
          expression: spanText,
          start: expr.start || 0,
          end: expr.end || 0,
          line: expr.loc?.start?.line || 1,
          resolvedValue: resolvedVal,
          isResolved,
          sourceType,
          defaultValue: resolvedVal || `/* ${spanText} */`,
        });

        const insertion = resolvedVal !== undefined
          ? resolvedVal
          : `/* UNRESOLVED: ${spanText} */ TRUE`;

        extractedSql += insertion;
      }
    }
  } else {
    // Fallback: search for backtick string or multiline SQL
    const match = sourceCode.match(/`([\s\S]*?(?:SELECT|WITH)[\s\S]*?)`/);
    if (match) {
      extractedSql = match[1];
    } else {
      extractedSql = sourceCode;
    }
  }

  // Scan extracted SQL for Positional parameters ($1, $2, etc.)
  const paramRegex = /\$([0-9]+)/g;
  let pMatch: RegExpExecArray | null;
  const seenParamIndices = new Set<number>();
  while ((pMatch = paramRegex.exec(extractedSql)) !== null) {
    const idx = parseInt(pMatch[1], 10);
    if (!seenParamIndices.has(idx)) {
      seenParamIndices.add(idx);
      parameters.push({
        index: idx,
        name: `$${idx}`,
        value: userOverrides[`$${idx}`] ?? undefined,
      });
    }
  }

  return {
    hasJsWrapper: true,
    extractedSql: extractedSql.trim(),
    originalCode: sourceCode,
    variables,
    parameters,
    isFullyResolved: isFullyResolved && parameters.every(p => p.value !== undefined || !userOverrides),
    syntaxErrors,
    frameworkDetected: framework,
    functionOrMethodName: candidateMethodName,
  };
}
