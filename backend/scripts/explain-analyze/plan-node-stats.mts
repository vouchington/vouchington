export interface NodeStats {
  nodeType: string
  relationName?: string
  actualRows: number
  planRows: number
  cost: number
  seqScan: boolean
  childCount: number
  rowsRemovedByFilter: number
  actualLoops: number
  sharedHitBlocks: number
  sharedReadBlocks: number
  sharedDirtiedBlocks: number
  sharedWrittenBlocks: number
  sharedBlocks: number
  tempReadBlocks: number
  tempWrittenBlocks: number
  walBytes: number
  diskSpill: boolean
  hashBatches: number
}

function getChildPlanNodes(planNode: Record<string, unknown>): Record<string, unknown>[] {
  const children: Record<string, unknown>[] = []
  const plans = planNode['Plans']
  if (Array.isArray(plans)) {
    children.push(
      ...plans.filter((p): p is Record<string, unknown> => typeof p === 'object' && p != null),
    )
  }
  const plan = planNode['Plan']
  if (plan != null && typeof plan === 'object') children.push(plan as Record<string, unknown>)
  return children
}

// Postgres's BUFFERS/temp/WAL counters are cumulative: each node's reported value already
// includes everything its descendants reported, so a single real spill echoes on every ancestor
// up to the plan root. Subtract descendants' own reported totals to get this node's exclusive
// contribution — the actual source of the pressure. `Sort Space Type` and `Hash Batches` are
// already per-node and must not be subtracted.
function exclusiveCount(
  planNode: Record<string, unknown>,
  children: Record<string, unknown>[],
  field: string,
): number {
  const own = Number(planNode[field] ?? 0)
  const childSum = children.reduce((sum, child) => sum + Number(child[field] ?? 0), 0)
  return Math.max(0, own - childSum)
}

export function collectNodes(node: unknown, stats: NodeStats[] = []): NodeStats[] {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return stats

  const planNode = node as Record<string, unknown>

  const nodeType = planNode['Node Type'] as string | undefined
  const plans = planNode['Plans']
  const children = getChildPlanNodes(planNode)

  if (nodeType) {
    // Shared-buffer counts stay cumulative (as Postgres reports them): highSharedBuffers only
    // ever picks the single costliest relation-bearing node, so it was never subject to the
    // echo-on-every-ancestor bug, and making it exclusive hides real pressure split across a
    // scan and its child (e.g. a Bitmap Heap Scan over a Bitmap Index Scan) where neither half
    // alone crosses the threshold.
    const sharedHitBlocks = (planNode['Shared Hit Blocks'] as number) ?? 0
    const sharedReadBlocks = (planNode['Shared Read Blocks'] as number) ?? 0
    const sharedDirtiedBlocks = (planNode['Shared Dirtied Blocks'] as number) ?? 0
    const sharedWrittenBlocks = (planNode['Shared Written Blocks'] as number) ?? 0

    stats.push({
      nodeType,
      relationName: planNode['Relation Name'] as string | undefined,
      actualRows: (planNode['Actual Rows'] as number) ?? 0,
      planRows: (planNode['Plan Rows'] as number) ?? 0,
      cost: (planNode['Total Cost'] as number) ?? 0,
      seqScan: nodeType === 'Seq Scan',
      childCount: Array.isArray(plans) ? plans.length : 0,
      rowsRemovedByFilter: (planNode['Rows Removed by Filter'] as number) ?? 0,
      actualLoops: (planNode['Actual Loops'] as number) ?? 1,
      sharedHitBlocks,
      sharedReadBlocks,
      sharedDirtiedBlocks,
      sharedWrittenBlocks,
      sharedBlocks: sharedHitBlocks + sharedReadBlocks,
      tempReadBlocks: exclusiveCount(planNode, children, 'Temp Read Blocks'),
      tempWrittenBlocks: exclusiveCount(planNode, children, 'Temp Written Blocks'),
      walBytes: exclusiveCount(planNode, children, 'WAL Bytes'),
      diskSpill: planNode['Sort Space Type'] === 'Disk',
      hashBatches: (planNode['Hash Batches'] as number) ?? 1,
    })
  }

  for (const child of children) collectNodes(child, stats)

  return stats
}
