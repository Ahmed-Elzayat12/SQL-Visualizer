import { parse } from '@babel/parser';
import type { DynamicVariable, JsAnalysisResult } from '../types/ast';

export function detectSourceLanguage(code: string, fallback: 'typescript' | 'sql'): 'typescript' | 'sql' {
  const text = code.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))+/, '');
  if (/^(?:export|import|async|function|class|const|let|var|@)\b|^@/i.test(text)) return 'typescript';
  if (/^(?:SELECT|WITH|EXPLAIN|INSERT|UPDATE|DELETE)\b/i.test(text)) return 'sql';
  return fallback;
}

// Static analysis only: never execute pasted application code.
export function analyzeSourceCode(
  sourceCode: string,
  userOverrides: Record<string, string> = {},
  language?: 'typescript' | 'sql',
  options: { illustrativeInputs?: boolean } = {},
): JsAnalysisResult {
  const sqlStart = /^(?:SELECT|WITH|INSERT|UPDATE|DELETE|EXPLAIN|CREATE)\b/i;
  const stripComments = (text: string) => text.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').trim();
  const raw = language === 'sql' || (language !== 'typescript' && sqlStart.test(stripComments(sourceCode)));
  const variables: DynamicVariable[] = [];
  const assumptions: string[] = [];
  const inputNodes = new Map<string, any>();
  const inputValues = new Map<string, any>();
  const isCteFragment = (value: string) => /^(?:[a-zA-Z_][a-zA-Z0-9_]*|"[^"]+")\s+AS\s+(?:(?:NOT\s+)?MATERIALIZED\s*)?\(/i.test(stripComments(value));
  const syntaxErrors: string[] = [];
  const bindings = new Map<string, any[]>();
  const candidates: { node: any; method?: string; args?: any; inputs?: any[] }[] = [];
  const queryCalls: { node: any; method?: string; args?: any; inputs?: any[] }[] = [];
  let extractedSql = raw ? sourceCode.trim() : '';
  let selected: typeof candidates[number] | undefined;
  const framework = raw ? 'Raw SQL' : /@Injectable|@Controller|NestJS/.test(sourceCode) ? 'NestJS' : /createQueryBuilder|dataSource|Repository/.test(sourceCode) ? 'TypeORM' : /(?:client|pool)\.query/.test(sourceCode) ? 'pg' : 'Generic TS';

  const span = (node: any) => sourceCode.slice(node.start, node.end);
  const lookup = (node: any): any => {
    if (node?.type !== 'Identifier') return node;
    const declarations = bindings.get(node.name);
    // Ambiguous/shadowed names require an explicit value.
    return declarations?.length === 1 ? declarations[0] : node;
  };
  function resolveInput(name: string): any {
    if (inputValues.has(name)) return inputValues.get(name);
    const node = inputNodes.get(name);
    const annotation = node?.typeAnnotation?.typeAnnotation;
    const stringArray = annotation?.type === 'TSArrayType' && annotation.elementType?.type === 'TSStringKeyword';
    const suggested = /scope/i.test(name) ? [] : ['TRUE'];
    let value: any;
    if (userOverrides[name] !== undefined) {
      if (stringArray) {
        try {
          value = JSON.parse(userOverrides[name]);
          if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error();
        } catch { syntaxErrors.push(`${name} must be a JSON array of strings, for example ["age >= 18"].`); value = undefined; }
      } else value = userOverrides[name];
    } else if (stringArray && /predicate|filter/i.test(name) && options.illustrativeInputs) {
      value = suggested;
      assumptions.push(`${name} = ${JSON.stringify(value)} (illustrative; original runtime filters are unknown).`);
    }
    inputValues.set(name, value);
    variables.push({ name, expression: name, start: node.start, end: node.end, line: node.loc?.start.line ?? 1,
      isResolved: value !== undefined, resolvedValue: value === undefined ? undefined : stringArray ? JSON.stringify(value) : String(value),
      sourceType: 'function_parameter', inputKind: stringArray ? 'string_array' : undefined,
      defaultValue: stringArray ? JSON.stringify(suggested) : undefined });
    return value;
  }
  function evaluate(node: any, seen = new Set<any>(), environment = new Map<string, any>()): any {
    if (!node || seen.has(node) || seen.size > 48) return undefined;
    seen.add(node);
    const text = span(node);
    if (node.type === 'Identifier' && environment.has(node.name)) return environment.get(node.name);
    if (node.type === 'Identifier' && inputNodes.has(node.name)) return resolveInput(node.name);
    if (userOverrides[text] !== undefined) return userOverrides[text];
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
    if (node.type === 'NullLiteral') return null;
    if (node.type === 'Identifier') {
      const value = lookup(node);
      return value === node ? undefined : evaluate(value, seen, environment);
    }
    if (['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'].includes(node.type)) return evaluate(node.expression, seen, environment);
    if (node.type === 'UnaryExpression' && node.operator === '-') {
      const value = evaluate(node.argument, seen, environment);
      return typeof value === 'number' ? -value : undefined;
    }
    if (node.type === 'ArrayExpression') {
      const values = node.elements.map((item: any) => evaluate(item, new Set(seen), environment));
      return values.every((value: any) => value !== undefined) ? values : undefined;
    }
    if (node.type === 'MemberExpression' && !node.computed && node.property.name === 'length') {
      const value = evaluate(node.object, new Set(seen), environment);
      return Array.isArray(value) || typeof value === 'string' ? value.length : undefined;
    }
    if (node.type === 'ConditionalExpression') {
      const condition = evaluate(node.test, new Set(seen), environment);
      return condition === undefined ? undefined : evaluate(condition ? node.consequent : node.alternate, new Set(seen), environment);
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
      const fn = lookup(node.callee);
      if (!['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(fn?.type)) return undefined;
      if (fn.params.some((param: any) => param.type !== 'Identifier')) return undefined;
      const args = node.arguments.map((argument: any) => evaluate(argument, new Set(seen), environment));
      if (args.some((arg: any) => arg === undefined)) return undefined;
      const local = new Map(environment);
      fn.params.forEach((param: any, i: number) => local.set(param.name, args[i]));
      // Only pure expression helpers or a single return statement are supported.
      const body = fn.body.type === 'BlockStatement' && fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement'
        ? fn.body.body[0].argument : fn.body.type === 'BlockStatement' ? undefined : fn.body;
      return evaluate(body, new Set(seen), local);
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      const left = evaluate(node.left, new Set(seen), environment);
      const right = evaluate(node.right, new Set(seen), environment);
      return left !== undefined && right !== undefined ? (left as any) + right : undefined;
    }
    if (node.type === 'TemplateLiteral') {
      let result = '';
      for (let i = 0; i < node.quasis.length; i++) {
        result += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
        if (i < node.expressions.length) {
          const value = evaluate(node.expressions[i], new Set(seen), environment);
          if (value === undefined) return undefined;
          result += String(value);
        }
      }
      return result;
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'join') {
      const values = evaluate(node.callee.object, new Set(seen), environment);
      const delimiter = node.arguments.length ? evaluate(node.arguments[0], new Set(seen), environment) : ',';
      return Array.isArray(values) && delimiter !== undefined ? values.join(String(delimiter)) : undefined;
    }
    return undefined;
  }

  if (!raw && sourceCode.trim()) {
    try {
      const ast = parse(sourceCode, { sourceType: 'unambiguous', plugins: ['typescript', 'decorators-legacy'], errorRecovery: false });
      function visit(node: any, method?: string, inputs: any[] = []) {
        if (!node || typeof node !== 'object') return;
        if (['ClassMethod', 'ObjectMethod', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
          method = node.key?.name ?? node.id?.name ?? method; inputs = node.params;
        }
        if (node.type === 'FunctionDeclaration' && node.id?.name) bindings.set(node.id.name, [...(bindings.get(node.id.name) ?? []), node]);
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
          bindings.set(node.id.name, [...(bindings.get(node.id.name) ?? []), node.init]);
        }
        if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && ['query', '$queryRaw', '$queryRawUnsafe'].includes(node.callee.property.name)) {
          queryCalls.push({ node: node.arguments[0], args: node.arguments[1], method, inputs });
        }
        if (node.type === 'TemplateLiteral' || node.type === 'StringLiteral' || (node.type === 'BinaryExpression' && node.operator === '+')) candidates.push({ node, method, inputs });
        for (const [key, value] of Object.entries(node)) {
          if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
          if (Array.isArray(value)) value.forEach(child => visit(child, method, inputs));
          else if (value && typeof value === 'object') visit(value, method, inputs);
        }
      }
      visit(ast);
      const looksSql = (candidate: typeof candidates[number]) => {
        const node = lookup(candidate.node);
        const value = evaluate(node);
        const prefix = node?.type === 'TemplateLiteral' ? node.quasis[0].value.cooked ?? '' : '';
        const text = typeof value === 'string' ? value : prefix;
        return sqlStart.test(stripComments(text)) || isCteFragment(text);
      };
      const calls = queryCalls.filter(looksSql);
      const strings = candidates.filter(looksSql).filter(candidate => !candidates.some(parent => parent !== candidate && parent.node.start <= candidate.node.start && parent.node.end >= candidate.node.end && looksSql(parent)));
      const choices = calls.length ? calls : strings;
      if (choices.length > 1) syntaxErrors.push('Multiple SQL queries found. Paste one method or one SQL query at a time.');
      else if (!choices.length) syntaxErrors.push('No embedded SQL found. For TypeORM QueryBuilder, paste the generated SQL from getQueryAndParameters().');
      else selected = choices[0];
      if (selected) {
        for (const param of selected.inputs ?? []) if (param.type === 'Identifier') inputNodes.set(param.name, param);
        const node = lookup(selected.node);
        if (node.type === 'TemplateLiteral') {
          extractedSql = node.quasis.map((quasi: any, i: number) => {
            let value = quasi.value.cooked ?? quasi.value.raw;
            const expr = node.expressions[i];
            if (expr) {
              const resolved = evaluate(expr);
              const text = span(expr);
              if (!variables.some(variable => variable.name === text)) variables.push({ name: text, expression: text, start: expr.start, end: expr.end, line: expr.loc.start.line, isResolved: resolved !== undefined, resolvedValue: resolved === undefined ? undefined : String(resolved), sourceType: expr.type === 'Identifier' ? 'identifier' : 'unknown' });
              value += resolved === undefined ? '${' + text + '}' : String(resolved);
            }
            return value;
          }).join('');
        } else {
          const value = evaluate(node);
          if (typeof value === 'string') extractedSql = value;
          else syntaxErrors.push('This SQL expression depends on runtime code. Paste the generated SQL instead.');
        }
      }
    } catch (error: any) {
      syntaxErrors.push(error.message || 'Unable to parse JavaScript / TypeScript.');
    }
  }

  if (isCteFragment(extractedSql)) {
    const headers = [...extractedSql.matchAll(/(?:^|\)\s*,)\s*([a-zA-Z_][a-zA-Z0-9_]*|"[^"]+")\s+AS\s+(?:(?:NOT\s+)?MATERIALIZED\s*)?\(/gi)];
    const lastName = headers.at(-1)?.[1];
    if (lastName) {
      extractedSql = `WITH ${extractedSql.trim().replace(/;$/, '')}\nSELECT * FROM ${lastName};`;
      assumptions.push(`CTE fragment completed with WITH and SELECT * FROM ${lastName}; the original final query was not supplied.`);
    }
  }

  const toSqlLiteral = (value: any): string | undefined => {
    if (value === undefined || Array.isArray(value) || typeof value === 'object' && value !== null) return undefined;
    if (value === null) return 'NULL';
    if (typeof value === 'string') return "'" + value.replace(/'/g, "''") + "'";
    return String(value);
  };
  const args = selected ? lookup(selected.args) : undefined;
  // SQL strings and comments must not be interpreted as bind parameters.
  const tokenPattern = /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$[\s\S]*?\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$|\$(\d+)\b/g;
  const parameters: JsAnalysisResult['parameters'] = [];
  const resolvedSql = extractedSql.replace(tokenPattern, (token, digits) => {
    if (!digits) return token;
    const index = Number(digits);
    const element = args?.type === 'ArrayExpression' ? args.elements[index - 1] : undefined;
    const value = userOverrides[`$${index}`] ?? toSqlLiteral(evaluate(element));
    if (!parameters.some(param => param.index === index)) parameters.push({ index, name: `$${index}`, value });
    return value ?? token;
  });
  parameters.sort((a, b) => a.index - b.index);
  return {
    hasJsWrapper: !raw, originalCode: sourceCode, extractedSql: resolvedSql.trim(), variables, parameters,
    isStructureReady: !!resolvedSql.trim() && !syntaxErrors.length && variables.every(v => v.isResolved),
    assumptions,
    isFullyResolved: !syntaxErrors.length && !assumptions.length && variables.every(v => v.isResolved) && parameters.every(p => p.value !== undefined),
    syntaxErrors, frameworkDetected: framework, functionOrMethodName: selected?.method,
  };
}
