import { beginTransaction } from '@data-stores/psql'
import { POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE } from './constants.mts'
import { retainPostPublicationKeys } from './retained-key-writes.mts'

/**
 * Materializes current feed items into the durable dirty-work key stream in bounded statements.
 * A failed reconciliation leaves the dirty-work row pending; replay skips keys already retained.
 */
export async function retainRssFeedNotificationImpacts(
  dirtyWorkId: string,
  rssFeedId: string,
): Promise<void> {
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each durable materialization statement is bounded.
    const count = await retainNotificationImpactPage(dirtyWorkId, rssFeedId)
    if (count === 0) return
  }
}

async function retainNotificationImpactPage(
  dirtyWorkId: string,
  rssFeedId: string,
): Promise<number> {
  await using query = await beginTransaction()
  const { rows } = await query<{ rss_feed_item_id: string }>(
    `/* retainRssFeedNotificationImpacts */
      WITH feed_scope AS (SELECT rss_feed_id FROM post_publication_rss_feed_identities WHERE id = $1::uuid), missing AS MATERIALIZED (
        SELECT source.rss_feed_item_id
        FROM rss_feed_item_sources source CROSS JOIN feed_scope
        WHERE source.rss_feed_id = feed_scope.rss_feed_id
          AND NOT EXISTS (
            SELECT 1
            FROM post_publication_dirty_work_keys retained
            JOIN post_publication_rss_feed_item_identities identity ON identity.id = retained.impact_rss_feed_item_identity_id
            WHERE retained.dirty_work_id = $2::uuid
              AND retained.impact_rss_feed_item_identity_id = identity.id
              AND identity.rss_feed_item_id = source.rss_feed_item_id
          )
        ORDER BY source.rss_feed_item_id
        LIMIT $3
      ) SELECT rss_feed_item_id FROM missing`,
    [rssFeedId, dirtyWorkId, POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE],
  )
  await retainPostPublicationKeys(
    query,
    dirtyWorkId,
    rows.map(row => ({ kind: 'impact_rss_feed_item', uuidValue: row.rss_feed_item_id })),
  )
  await query.commit()
  return rows.length
}
