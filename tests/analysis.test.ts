import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSourceCode } from '../src/engine/jsAnalyzer';
import { parseSqlQuery } from '../src/engine/sqlParser';
import { simulateQueryExecution } from '../src/engine/simulationEngine';
import { SIMPLE_EXAMPLES, SIMPLE_TABLES } from '../src/data/simpleExamples';

test('NestJS decorators, string query and numeric bind values', () => {
  const result = analyzeSourceCode(SIMPLE_EXAMPLES.nest.code);
  assert.equal(result.frameworkDetected, 'NestJS');
  assert.equal(result.functionOrMethodName, 'findAdults');
  assert.equal(result.isFullyResolved, true);
  assert.match(result.extractedSql, /age >= 18/);
});
test('templates resolve constants and array joins', () => {
  const result = analyzeSourceCode("const filters = ['age >= 18', 'age < 30']; const sql = `SELECT * FROM users WHERE ${filters.join(' AND ')}`;");
  assert.equal(result.extractedSql, 'SELECT * FROM users WHERE age >= 18 AND age < 30');
  assert.equal(result.isFullyResolved, true);
});
test('runtime interpolation stays unresolved until explicitly supplied', () => {
  const code = 'const sql = `SELECT * FROM users WHERE age >= ${dto.age}`;';
  const missing = analyzeSourceCode(code);
  assert.equal(missing.isFullyResolved, false);
  assert.ok(!missing.extractedSql.includes('TRUE'));
  assert.equal(analyzeSourceCode(code, { 'dto.age': '18' }).isFullyResolved, true);
});
test('query argument takes precedence over unrelated SQL strings', () => {
  const result = analyzeSourceCode("const sql = 'SELECT * FROM users'; client.query(sql); const note = 'SELECT nothing FROM nowhere';");
  assert.equal(result.extractedSql, 'SELECT * FROM users');
});
test('multiple queries and QueryBuilder produce clear diagnostics', () => {
  assert.match(analyzeSourceCode("client.query('SELECT * FROM users'); client.query('SELECT * FROM orders');").syntaxErrors[0], /Multiple/);
  assert.match(analyzeSourceCode("repo.createQueryBuilder('user').getMany();").syntaxErrors[0], /getQueryAndParameters/);
});
test('bind literals are escaped and unresolved binds block readiness', () => {
  assert.match(analyzeSourceCode(`client.query('SELECT * FROM users WHERE name = $1', ["O'Brien"]);`).extractedSql, /'O''Brien'/);
  assert.equal(analyzeSourceCode('SELECT * FROM users WHERE age >= $1').isFullyResolved, false);
  assert.equal(analyzeSourceCode('SELECT * FROM users WHERE age >= $1', { '$1': '18' }).isFullyResolved, true);
});
test('SQL comments and quoted dollar strings are not bind parameters', () => {
  const result = analyzeSourceCode("-- example\nSELECT '$1', $$ $2 $$ FROM users -- $3");
  assert.deepEqual(result.parameters, []);
  assert.equal(result.hasJsWrapper, false);
});
test('malformed source never falls back to pretending it is SQL', () => {
  const result = analyzeSourceCode('class { broken');
  assert.equal(result.isFullyResolved, false);
  assert.equal(result.extractedSql, '');
});
for (const [name, demo] of Object.entries(SIMPLE_EXAMPLES)) {
  test(`${name} example filters, sorts and projects the same three adults`, () => {
    const analysis = analyzeSourceCode(demo.code);
    const query = parseSqlQuery(analysis.extractedSql);
    if (name === 'cte') {
      assert.equal(query.ctes.length, 1);
      assert.equal(query.ctes[0].name, 'adults');
    }
    const steps = simulateQueryExecution(query, SIMPLE_TABLES);
    assert.deepEqual(steps.at(-1)?.outputRows.map(row => row.age), [18, 22, 30]);
    assert.deepEqual(steps.at(-1)?.outputRows.map(row => row.name), ['Omar', 'Mona', 'Sara']);
    if (name === 'cte') assert.equal(steps.at(-1)?.outputRows[0].id, undefined);
    assert.equal(SIMPLE_TABLES.users.length, 4);
  });
}
test('SQL null comparisons do not pass and unknown filters do not silently pass', () => {
  const run = (sql: string) => simulateQueryExecution(parseSqlQuery(sql), { users: [{ __rowId: '1', age: null }, { __rowId: '2', age: 20 }] });
  assert.equal(run('SELECT * FROM users WHERE age >= 18').at(-1)?.outputRows.length, 1);
  assert.throws(() => run("SELECT * FROM users WHERE age BETWEEN 18 AND 30"), /does not support/);
});
