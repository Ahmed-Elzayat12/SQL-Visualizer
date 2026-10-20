import type { ExplainPlanNode, ExplainResult } from '../types/execution';

/**
 * Parses and analyzes PostgreSQL EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) output.
 * Identifies physical bottlenecks, buffer hits/reads, and execution hotspots.
 */
export function parseExplainJson(rawJsonText: string): ExplainResult | null {
  try {
    let parsed = JSON.parse(rawJsonText);
    // Usually PostgreSQL outputs an array with a single object containing 'Plan'
    if (Array.isArray(parsed) && parsed.length > 0) {
      parsed = parsed[0];
    }

    const rawPlan = parsed['Plan'] || parsed;
    const planningTime = parsed['Planning Time'] || parsed['Planning'];
    const executionTime = parsed['Execution Time'] || parsed['Execution'];

    const rootNode = normalizeExplainNode(rawPlan);

    const bottlenecks: ExplainResult['bottlenecks'] = [];
    inspectBottlenecks(rootNode, bottlenecks);

    return {
      rawJson: rawJsonText,
      rootNode,
      planningTimeMs: planningTime,
      executionTimeMs: executionTime,
      totalCost: rootNode.totalCost || 0,
      totalActualTimeMs: rootNode.actualTotalTime || executionTime || 0,
      bottlenecks,
    };
  } catch (err) {
    console.error('Failed to parse EXPLAIN JSON:', err);
    return null;
  }
}

function normalizeExplainNode(node: any): ExplainPlanNode {
  return {
    nodeType: node['Node Type'] || 'Unknown',
    relationName: node['Relation Name'],
    alias: node['Alias'],
    startupCost: node['Startup Cost'],
    totalCost: node['Total Cost'],
    planRows: node['Plan Rows'],
    planWidth: node['Plan Width'],
    actualStartupTime: node['Actual Startup Time'],
    actualTotalTime: node['Actual Total Time'],
    actualRows: node['Actual Rows'],
    actualLoops: node['Actual Loops'],
    filter: node['Filter'],
    rowsRemovedByFilter: node['Rows Removed by Filter'],
    indexName: node['Index Name'],
    indexCond: node['Index Cond'],
    joinType: node['Join Type'],
    hashCond: node['Hash Cond'],
    sharedHitBlocks: node['Shared Hit Blocks'],
    sharedReadBlocks: node['Shared Read Blocks'],
    cteName: node['CTE Name'],
    plans: Array.isArray(node['Plans']) ? node['Plans'].map(normalizeExplainNode) : undefined,
  };
}

function inspectBottlenecks(node: ExplainPlanNode, list: ExplainResult['bottlenecks']) {
  // Check large sequential scan
  if (node.nodeType === 'Seq Scan' && (node.actualRows || 0) > 1000) {
    list.push({
      type: 'SEQ_SCAN',
      nodeType: node.nodeType,
      description: `Sequential scan on '${node.relationName}' processed ${node.actualRows} rows.`,
      recommendation: `Consider adding an index on columns used in filter: ${node.filter || 'table predicates'}.`,
    });
  }

  // Check filter that threw away majority of rows
  if (node.rowsRemovedByFilter && node.rowsRemovedByFilter > 500) {
    list.push({
      type: 'EXPENSIVE_FILTER',
      nodeType: node.nodeType,
      description: `Filter '${node.filter}' discarded ${node.rowsRemovedByFilter} rows after scanning them from disk.`,
      recommendation: `An index condition on this predicate would skip scanning these blocks entirely.`,
    });
  }

  // Check slow execution time
  if ((node.actualTotalTime || 0) > 100) {
    list.push({
      type: 'SLOW_TIME',
      nodeType: node.nodeType,
      description: `${node.nodeType} took ${node.actualTotalTime}ms to execute.`,
      recommendation: `Review work_mem or check if pre-filtering before this node reduces load.`,
    });
  }

  if (node.plans) {
    for (const child of node.plans) {
      inspectBottlenecks(child, list);
    }
  }
}
