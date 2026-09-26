import { write } from '@data-stores/psql'
import { definePlanStatisticsRefresh } from '../query-plans.mts'

export const analyzePublicationSlugPageForTest = definePlanStatisticsRefresh(async () => {
  await write('/* analyzePublicationSlugPageForTest */ ANALYZE post_slugs')
})
export const analyzePublicationFeedItemPageForTest = definePlanStatisticsRefresh(async () => {
  await write(
    '/* analyzePublicationFeedItemPageForTest */ ANALYZE posts, post__stories, rss_feed_items, rss_feed_item_sources',
  )
})
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
