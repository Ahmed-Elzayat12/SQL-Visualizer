// Illustrative plan for SELECT * FROM users WHERE age >= 18.
export const SAMPLE_EXPLAIN_JSON = JSON.stringify([{
  Plan: {
    'Node Type': 'Seq Scan', 'Relation Name': 'users', Alias: 'users',
    'Startup Cost': 0, 'Total Cost': 1.05, 'Plan Rows': 3, 'Plan Width': 40,
    'Actual Startup Time': 0.01, 'Actual Total Time': 0.02,
    'Actual Rows': 3, 'Actual Loops': 1,
    Filter: '(age >= 18)', 'Rows Removed by Filter': 1,
  },
  'Planning Time': 0.1, 'Execution Time': 0.03,
}], null, 2);
