export interface SqlToken {
  value: string;
  start: number;
  end: number;
  depth: number;
  kind: 'word' | 'identifier' | 'literal' | 'symbol';
}

// Preserve source offsets; quoted text and comments cannot introduce SQL keywords.
export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const pattern = /\s+|--[^\n]*|\/\*[\s\S]*?\*\/|\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$|'(?:''|[^'])*'|"(?:""|[^"])*"|[a-zA-Z_][a-zA-Z_0-9$]*|[^\s]/gy;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql))) {
    const value = match[0];
    if (/^\s|^--|^\/\*/.test(value)) continue;
    if (/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$$/.test(value)) {
      const close = sql.indexOf(value, pattern.lastIndex);
      if (close >= 0) pattern.lastIndex = close + value.length;
      tokens.push({ value: sql.slice(match.index, pattern.lastIndex), start: match.index, end: pattern.lastIndex, depth, kind: 'literal' });
      continue;
    }
    if (value === ')') depth = Math.max(0, depth - 1);
    const kind = value.startsWith('"') ? 'identifier' : value.startsWith("'") ? 'literal' : /^[a-zA-Z_]/.test(value) ? 'word' : 'symbol';
    tokens.push({ value, start: match.index, end: pattern.lastIndex, depth, kind });
    if (value === '(') depth++;
  }
  return tokens;
}

export function isKeyword(token: SqlToken | undefined, value: string) {
  return token?.kind === 'word' && token.value.toUpperCase() === value;
}

export function relationAfter(tokens: SqlToken[], index: number): string | undefined {
  const token = tokens[index + 1];
  if (!token || !['word', 'identifier'].includes(token.kind) || /^(LATERAL|ONLY|SELECT)$/i.test(token.value)) return undefined;
  const unquote = (value: string) => value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value;
  let name = unquote(token.value);
  let next = index + 2;
  while (tokens[next]?.value === '.' && ['word', 'identifier'].includes(tokens[next + 1]?.kind)) {
    name += '.' + unquote(tokens[next + 1].value);
    next += 2;
  }
  return tokens[next]?.value === '(' ? undefined : name;
}

export function sourceRelations(tokens: SqlToken[]): string[] {
  const selectDepths = new Set<number>();
  const sources = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    for (const depth of selectDepths) if (depth > token.depth) selectDepths.delete(depth);
    if (isKeyword(token, 'SELECT')) selectDepths.add(token.depth);
    if ((isKeyword(token, 'FROM') || isKeyword(token, 'JOIN')) && selectDepths.has(token.depth)) {
      const name = relationAfter(tokens, i);
      if (name) sources.add(name);
    }
  }
  return [...sources];
}
