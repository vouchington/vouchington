import { write } from '@data-stores/psql'
import { collectPlanNodes, definePlanStatisticsRefresh } from '../query-plans.mts'

export const analyzePublicationSlugPageForTest = definePlanStatisticsRefresh(async () => {
  await write('/* analyzePublicationSlugPageForTest */ ANALYZE post_slugs')
})
export const analyzePublicationFeedItemPageForTest = definePlanStatisticsRefresh(async () => {
  await write(
    '/* analyzePublicationFeedItemPageForTest */ ANALYZE posts, post__stories, rss_feed_items, rss_feed_item_sources, urls',
  )
})
export async function countPublicationFeedSourcesForTest(): Promise<number> {
  const { rows } = await write<{ count: string }>(
    '/* countPublicationFeedSourcesForTest */ SELECT COUNT(*)::text AS count FROM rss_feed_item_sources',
  )
  return Number(rows[0]!.count)
}
export const analyzePublicationSnapshotKeyPageForTest = definePlanStatisticsRefresh(async () => {
  await write(
    '/* analyzePublicationSnapshotKeyPageForTest */ ANALYZE post_publication_identity_snapshot_keys',
  )
})
export const analyzePublicationCleanupPageForTest = definePlanStatisticsRefresh(async () => {
  await write(
    '/* analyzePublicationCleanupPageForTest */ ANALYZE post_publication_identity_snapshots, post_publication_projection_receipts, post_publication_dirty_work',
  )
})

export async function insertTestPublicationSnapshotHeaderFanout(options: {
  workId: string
  generation: string
  postId: string
  count: number
  abandoned?: boolean
}): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* insertTestPublicationSnapshotHeaderFanout */ INSERT INTO post_publication_identity_snapshots
    (dirty_work_id, generation, post_id, eligibility_fingerprint, is_public, abandoned_at)
    SELECT $1, $2, $3, 'header-plan-fixture', false, CASE WHEN $5 THEN CURRENT_TIMESTAMP END FROM generate_series(1, $4) RETURNING id`,
    [options.workId, options.generation, options.postId, options.count, options.abandoned ?? false],
  )
  return rows.map(row => row.id)
}

export function publicationPhysicalRowsWithinBudget(
  plan: unknown,
  relation: string,
  budget = 100,
): number {
  const rows = collectPlanNodes(plan)
    .filter(node => publicationMatchesRelation(node, relation))
    .reduce(
      (rows, node) =>
        rows +
        (Number(node['Actual Rows'] ?? 0) +
          Number(node['Rows Removed by Filter'] ?? 0) +
          Number(node['Rows Removed by Index Recheck'] ?? 0)) *
          Number(node['Actual Loops'] ?? 1),
      0,
    )
  if (rows > budget)
    throw new Error(
      `${relation} scanned ${rows} physical rows above budget ${budget}: ${JSON.stringify(
        collectPlanNodes(plan).filter(node => publicationMatchesRelation(node, relation)),
      )}`,
    )
  return rows
}
export function publicationMatchesRelation(
  node: Record<string, unknown>,
  relation: string,
): boolean {
  return (
    node['Relation Name'] === relation || String(node['Relation Name']).startsWith(`${relation}_`)
  )
}
export function publicationScanIndexes(plan: unknown, relation: string): unknown[] {
  return collectPlanNodes(plan).flatMap(node =>
    node['Relation Name'] === relation ? [node['Index Name']] : [],
  )
}
