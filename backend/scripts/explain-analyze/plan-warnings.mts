import type { ExplainResult } from '@data-stores/psql'
import { collectNodes, type NodeStats } from './plan-node-stats.mts'

const LARGE_TABLES = new Set([
  'posts',
  'users',
  'topics',
  'rss_feeds',
  'rss_feed_items',
  'rss_feed_item_categories',
  'relation__user__follow__user',
  'relation__user__follow__rss_feed',
  'relation__user__follow__topic',
  'relation__user__mute__user',
  'relation__user__block__user',
  'relation__post__category__topic',
  'crawls',
  'crawl_chunks',
  'post_votes',
  'topic_votes',
  'notifications',
  'community_post_reviews',
  'topic_aliases',
  'post_data_point_topics',
  'post_review_topic_ratings',
])

const HIGH_SHARED_BLOCKS_THRESHOLD = 10_000
const HIGH_WAL_BYTES_THRESHOLD = 10 * 1024 * 1024

function isLargeTable(relationName: string): boolean {
  if (LARGE_TABLES.has(relationName)) return true
  const base = relationName.replace(/__(?:default|p_\w+)$/, '')
  return base !== relationName && LARGE_TABLES.has(base)
}

// The root plan node's own reported WAL Bytes is cumulative over the whole query (it already
// includes every descendant's contribution), so reading it directly — with no subtraction —
// gives the query-wide WAL total in one step.
function getTotalWalBytes(plan: unknown): number {
  if (plan == null || typeof plan !== 'object' || Array.isArray(plan)) return 0
  const wrapper = plan as Record<string, unknown>
  const root = wrapper['Plan']
  const rootNode = root != null && typeof root === 'object' && !Array.isArray(root) ? root : wrapper
  return Number((rootNode as Record<string, unknown>)['WAL Bytes'] ?? 0)
}

interface QueryWarnings {
  seqScans: { relationName: string; actualRows: number; scannedRows: number }[]
  estimateMismatches: {
    nodeType: string
    relationName: string
    planRows: number
    actualRows: number
    ratio: number
  }[]
  costliestNode: NodeStats | undefined
  appendOverhead: { nodeType: string; childCount: number }[]
  highPlanningRatio: boolean
  highSharedBuffers: NodeStats[]
  resourcePressure: NodeStats[]
}

export function getResourcePressureFingerprints(result: ExplainResult): string[] {
  const nodes = collectNodes(result.plan)

  const fingerprints = nodes.flatMap(node => {
    const nodeIdentity = `${node.nodeType}:${node.relationName ?? '-'}`
    const nodeFingerprints: string[] = []
    if (node.tempReadBlocks > 0) nodeFingerprints.push(`${nodeIdentity}:temp-read`)
    if (node.tempWrittenBlocks > 0) nodeFingerprints.push(`${nodeIdentity}:temp-written`)
    if (node.diskSpill) nodeFingerprints.push(`${nodeIdentity}:disk-spill`)
    if (node.hashBatches > 1) nodeFingerprints.push(`${nodeIdentity}:hash-batches`)
    if (node.walBytes >= HIGH_WAL_BYTES_THRESHOLD) nodeFingerprints.push(`${nodeIdentity}:wal`)
    return nodeFingerprints
  })

  // Exclusive per-node WAL identifies which single node is the dominant contributor, but WAL
  // written by several sibling nodes (e.g. multiple modifying children of a CTE) can sum past
  // the threshold at their shared ancestor while no individual node's exclusive share does.
  // Only add this when no node already crossed the threshold, so one real spike still reports
  // as a single fingerprint instead of two.
  const anyNodeCrossedWalThreshold = nodes.some(n => n.walBytes >= HIGH_WAL_BYTES_THRESHOLD)
  if (!anyNodeCrossedWalThreshold && getTotalWalBytes(result.plan) >= HIGH_WAL_BYTES_THRESHOLD) {
    fingerprints.push('query:wal-aggregate')
  }

  return fingerprints.toSorted()
}

export function analyzeResult(result: ExplainResult): QueryWarnings {
  const nodes = collectNodes(result.plan)

  const seqScans = nodes.flatMap(n => {
    if (!(n.seqScan && n.relationName && isLargeTable(n.relationName))) return []
    const actualRows = Math.round(n.actualRows * n.actualLoops)
    const scannedRows = Math.round((n.actualRows + n.rowsRemovedByFilter) * n.actualLoops)
    return scannedRows > 0 ? [{ relationName: n.relationName, actualRows, scannedRows }] : []
  })

  const estimateMismatches = nodes
    .flatMap(n => {
      if (n.planRows <= 0 || n.actualRows <= 0) return []
      const ratio = Math.max(n.planRows / n.actualRows, n.actualRows / n.planRows)
      return ratio > 10
        ? [
            {
              nodeType: n.nodeType,
              relationName: n.relationName ?? 'unknown',
              planRows: n.planRows,
              actualRows: n.actualRows,
              ratio,
            },
          ]
        : []
    })
    .toSorted((a, b) => b.ratio - a.ratio)
    .slice(0, 3)

  const costliestNode = nodes.reduce<(typeof nodes)[number] | undefined>(
    (max, n) => (max == null || n.cost > max.cost ? n : max),
    undefined,
  )

  const appendOverhead = nodes.flatMap(n =>
    n.nodeType === 'Append' && n.childCount > 2
      ? [{ nodeType: n.nodeType, childCount: n.childCount }]
      : [],
  )

  const highPlanningRatio =
    result.execution_time_ms > 2 && result.planning_time_ms / result.execution_time_ms > 0.5

  const highSharedBuffers = nodes
    .filter(n => n.relationName && n.sharedBlocks >= HIGH_SHARED_BLOCKS_THRESHOLD)
    .toSorted((a, b) => b.sharedBlocks - a.sharedBlocks)
    .slice(0, 1)

  const resourcePressure = nodes.filter(
    n =>
      n.tempReadBlocks > 0 ||
      n.tempWrittenBlocks > 0 ||
      n.diskSpill ||
      n.hashBatches > 1 ||
      n.walBytes >= HIGH_WAL_BYTES_THRESHOLD,
  )

  return {
    seqScans,
    estimateMismatches,
    costliestNode,
    appendOverhead,
    highPlanningRatio,
    highSharedBuffers,
    resourcePressure,
  }
}
