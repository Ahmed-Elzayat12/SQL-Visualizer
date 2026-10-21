export function DocsView() {
  return <div className="h-full overflow-auto p-6 text-sm text-slate-300 space-y-5 max-w-3xl mx-auto">
    <h1 className="text-xl font-bold text-white">Getting started</h1>
    <p>Choose a simple example, then select a graph node or use the step controls to inspect the sample rows. The users table contains four people; age &gt;= 18 keeps three of them.</p>
    <h2 className="font-semibold text-white">SQL or NestJS?</h2>
    <p>SQL is the simplest input. For NestJS, paste one method containing a SQL string, template or .query(sql, params) call. Static constants and bind values can be resolved without running your code. Open Extracted SQL to review or use the result.</p>
    <p>Runtime expressions need values in Resolve Variables. If several queries are found, paste one at a time. TypeORM QueryBuilder chains are not converted: use getQueryAndParameters() in your application and paste its SQL, then enter the bind values here.</p>
    <h2 className="font-semibold text-white">Functions that return CTE fragments</h2>
    <p>Paste the entire TS function, including its local helpers. Pure expression helpers, string-array joins, length checks and conditional expressions can be reconstructed. Standalone CTE fragments get a WITH prefix and a final SELECT from the last CTE for preview.</p>
    <p>Illustrative inputs use [] for unknown scope predicate arrays and ["TRUE"] for other unknown predicate arrays. Every assumption is listed above the editor. Turn the option off for strict inputs, or enter actual JSON arrays in Resolve Variables. SQL bind parameters may remain as placeholders for structure analysis.</p>
    <p>UNION ALL branches and correlated LATERAL subqueries appear in the graph. This structural preview does not produce database result rows or execute your TS code.</p>
    <h2 className="font-semibold text-white">Sample simulation</h2>
    <p>This is a limited learning simulator, not a PostgreSQL server. Simple comparisons, filters and sorting work on the sample tables. Unsupported filters display a message; Structure mode lets you inspect the query without simulating it. Estimated timings are illustrative. For database measurements, paste an actual EXPLAIN JSON plan into the EXPLAIN tab.</p>
    <p>Pasted JavaScript is parsed with Babel and is never executed.</p>
  </div>;
}
