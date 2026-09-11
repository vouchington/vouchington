import { write } from '@data-stores/psql'
import { POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE } from './constants.mts'

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
    const { rows } = await write<{ selected_count: string }>(
      `/* retainRssFeedNotificationImpacts */
      WITH missing AS MATERIALIZED (
        SELECT source.rss_feed_item_id
        FROM rss_feed_item_sources source
        WHERE source.rss_feed_id = $1::uuid
          AND NOT EXISTS (
            SELECT 1
            FROM post_publication_dirty_work_keys retained
            WHERE retained.dirty_work_id = $2::uuid
              AND retained.kind = 'impact_rss_feed_item'
              AND retained.uuid_value = source.rss_feed_item_id
          )
        ORDER BY source.rss_feed_item_id
        LIMIT $3
      ), inserted AS (
        INSERT INTO post_publication_dirty_work_keys (dirty_work_id, kind, uuid_value)
        SELECT dirty_work_id, kind, uuid_value
        FROM (
          SELECT $2::uuid AS dirty_work_id, 'impact_rss_feed_item'::text AS kind,
            missing.rss_feed_item_id AS uuid_value
          FROM missing
        ) source
        ORDER BY dirty_work_id, kind, uuid_value
        ON CONFLICT (dirty_work_id, kind, uuid_value) WHERE uuid_value IS NOT NULL DO NOTHING
        RETURNING 1
      )
      SELECT COUNT(*)::text AS selected_count FROM missing`,
      [rssFeedId, dirtyWorkId, POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE],
    )
    if (Number(rows[0]?.selected_count ?? 0) === 0) return
  }
}
