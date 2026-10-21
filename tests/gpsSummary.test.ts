import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gpsSummaryPieces } from './fixtures/gpsSummaryPieces';
import { analyzeSourceCode, detectSourceLanguage } from '../src/engine/jsAnalyzer';
import { parseSqlQuery } from '../src/engine/sqlParser';
import { simulateQueryExecution } from '../src/engine/simulationEngine';

const source = readFileSync(new URL('./fixtures/gpsSummaryPieces.ts', import.meta.url), 'utf8');
const preview = () => analyzeSourceCode(source, {}, 'typescript', { illustrativeInputs: true });

test('pasting the supplied commented TS function switches out of SQL mode', () => {
  assert.equal(detectSourceLanguage(source, 'sql'), 'typescript');
  assert.equal(detectSourceLanguage('-- sample\nSELECT * FROM users', 'typescript'), 'sql');
});

test('the complete GPS function produces the actual helper-expanded SQL, plus an explicit final SELECT', () => {
  const result = preview();
  // Trusted fixture is executed only by this test as an independent reference.
  assert.equal(result.extractedSql, `WITH ${gpsSummaryPieces(['TRUE'], [])}\nSELECT * FROM filtered;`);
  assert.equal(result.isStructureReady, true);
  assert.equal(result.isFullyResolved, false);
  assert.deepEqual(result.syntaxErrors, []);
  assert.equal(result.assumptions.length, 3);
  assert.match(result.assumptions.join('\n'), /rawPredicates/);
  assert.match(result.assumptions.join('\n'), /original final query was not supplied/);
  assert.deepEqual(result.parameters.map(p => p.name), ['$1', '$2']);
  assert.ok(!result.extractedSql.includes('${'));
});

test('strict mode leaves missing function inputs unresolved', () => {
  const result = analyzeSourceCode(source);
  assert.equal(result.isStructureReady, false);
  assert.equal(result.isFullyResolved, false);
  assert.ok(result.variables.some(v => v.name === 'rawPredicates' && !v.isResolved));
});

test('real JSON predicate arrays override illustrative inputs and resolve the nonempty ternary branch', () => {
  const raw = ['b."receivedAt" >= $1::timestamptz', 'b."receivedAt" < $2::timestamptz'];
  const scope = ['"vehicleId" = $3'];
  const result = analyzeSourceCode(source, { rawPredicates: JSON.stringify(raw), scopePredicates: JSON.stringify(scope) }, 'typescript', { illustrativeInputs: true });
  assert.equal(result.extractedSql, `WITH ${gpsSummaryPieces(raw, scope)}\nSELECT * FROM filtered;`);
  assert.equal(result.isStructureReady, true);
  assert.equal(result.assumptions.length, 1);
  assert.deepEqual(result.parameters.map(p => p.name), ['$1', '$2', '$3']);
});

test('invalid array input is reported instead of silently replaced', () => {
  for (const rawPredicates of ['not JSON', '{}', '[1]']) {
    const result = analyzeSourceCode(source, { rawPredicates }, 'typescript', { illustrativeInputs: true });
    assert.equal(result.isStructureReady, false);
    assert.match(result.syntaxErrors.join('\n'), /rawPredicates must be a JSON array of strings/);
  }
});

test('helper argument environments do not leak between calls', () => {
  const code = "const expr = (value: string) => `(${value})`; const sql = `SELECT ${expr('age')}, ${expr('id')} FROM users`;";
  assert.equal(analyzeSourceCode(code).extractedSql, 'SELECT (age), (id) FROM users');
});

test('recursive or side-effecting helpers remain unresolved without executing pasted code', () => {
  for (const helper of ['const f = (x: string): string => f(x);', 'const f = (x: string) => fetch(x);', 'const f = (x: string) => { console.log(x); return x; };']) {
    const result = analyzeSourceCode(helper + "const sql = `SELECT * FROM users WHERE ${f('TRUE')}`;");
    assert.equal(result.isStructureReady, false);
  }
});

test('GPS dependency analysis preserves both physical sources and both materialized CTEs', () => {
  const parsed = parseSqlQuery(preview().extractedSql);
  assert.deepEqual(parsed.parseErrors, []);
  assert.deepEqual(parsed.ctes.map(cte => cte.name), ['pieces', 'filtered']);
  assert.ok(parsed.ctes.every(cte => cte.isMaterialized));
  assert.deepEqual(parsed.sourceTables, ['gps_summary_buckets', 'reporting_vehicle_gps_track_batches']);
  assert.deepEqual(parsed.ctes[1].dependencies, ['pieces', 'reporting_vehicle_gps_track_batches']);
  assert.deepEqual(parsed.finalQuery.from, ['filtered']);
  const lateral = parsed.allOperations.find(op => op.type === 'LATERAL_JOIN');
  assert.ok(lateral);
  assert.match(lateral.sqlSnippet, /IS TRUE AS usable/);
  const rawFilter = parsed.allOperations.find(op => op.id === 'filtered_branch_2_where');
  assert.ok(rawFilter);
  assert.match(rawFilter.sqlSnippet, /^WHERE TRUE/);
  assert.ok(!rawFilter.sqlSnippet.includes('AS usable'));
  const union = parsed.allOperations.find(op => op.type === 'UNION_ALL');
  assert.deepEqual(union?.inputOperationIds, ['filtered_branch_1_output', 'filtered_branch_2_output']);
  assert.ok(parsed.syntaxLimitations.length >= 2);
  assert.throws(() => simulateQueryExecution(parsed, {}), /structure analysis only/);
});

test('SQL strings, quoted identifiers and EXTRACT FROM cannot create false dependencies', () => {
  const parsed = parseSqlQuery(`-- leading comment
    WITH "pieces" AS MATERIALIZED (
      SELECT 'SELECT FROM fake UNION ALL' AS note, extract(epoch FROM received_at) AS age
      FROM "public"."events"
    ), "filtered" AS (SELECT * FROM "pieces")
    SELECT * FROM "filtered";`);
  assert.deepEqual(parsed.sourceTables, ['public.events']);
  assert.deepEqual(parsed.ctes.map(cte => cte.name), ['pieces', 'filtered']);
  assert.ok(!parsed.allOperations.some(op => op.type === 'UNION_ALL'));
});

test('structure is available before bound values are supplied', () => {
  const result = analyzeSourceCode('SELECT * FROM users WHERE age >= $1');
  assert.equal(result.isStructureReady, true);
  assert.equal(result.isFullyResolved, false);
});
