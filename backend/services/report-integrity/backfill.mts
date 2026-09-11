import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { MASS_REPORT_THRESHOLD, MASS_REPORT_WINDOW_MINUTES } from './config.mts'

export type PendingReportEntity = {
  entityType: string
  entityId: string
}

const BACKFILL_BATCH_SIZE = 500

/**
 * Streams batches of entities that currently have >= MASS_REPORT_THRESHOLD distinct
 * reporters within the MASS_REPORT_WINDOW_MINUTES window. Used by the backfill
 * dispatcher to re-enqueue integrity checks that may have been lost.
 *
 * Only pending reports within the time window are considered; out-of-window or
 * resolved reports are excluded. For posts, JOINs to `posts` to distinguish
 * post vs comment (same FK column).
 */
export async function* streamEntitiesWithPendingReportsBatches(): AsyncGenerator<
  PendingReportEntity[],
  void,
  unknown
> {
  let batch: PendingReportEntity[] = []
  const windowStartId = getMinUUIDv7ForDate(
    new Date(Date.now() - MASS_REPORT_WINDOW_MINUTES * 60 * 1000),
  )
  for await (const row of createAsyncGeneratorFromCursor<{
    entity_type: string
    entity_id: string
  }>(
    sql`/* streamEntitiesWithPendingReportsBatches */
    SELECT entity_type, entity_id FROM (
      SELECT
        CASE WHEN p.post_type = 'comment' THEN 'comment' ELSE 'post' END AS entity_type,
        mr.post_id::text AS entity_id
      FROM moderation_reports mr
      JOIN posts p ON p.id = mr.post_id AND p.deleted_at IS NULL
      WHERE mr.post_id IS NOT NULL
        AND mr.reviewed_at IS NULL
        AND mr.id >= ${windowStartId}
      GROUP BY mr.post_id, p.post_type
      HAVING COUNT(DISTINCT mr.reporter_user_id) >= ${MASS_REPORT_THRESHOLD}

      UNION ALL

      SELECT 'user' AS entity_type, mr.reported_user_id::text AS entity_id
      FROM moderation_reports mr
      JOIN users u ON u.id = mr.reported_user_id AND u.deleted_at IS NULL
      WHERE mr.reported_user_id IS NOT NULL
        AND mr.reviewed_at IS NULL
        AND mr.id >= ${windowStartId}
      GROUP BY mr.reported_user_id
      HAVING COUNT(DISTINCT mr.reporter_user_id) >= ${MASS_REPORT_THRESHOLD}

      UNION ALL

      SELECT 'url_hostname' AS entity_type, mr.hostname_id::text AS entity_id
      FROM moderation_reports mr
      JOIN url_hostnames uh ON uh.id = mr.hostname_id AND uh.blocked IS NOT TRUE
      WHERE mr.hostname_id IS NOT NULL
        AND mr.reviewed_at IS NULL
        AND mr.id >= ${windowStartId}
      GROUP BY mr.hostname_id
      HAVING COUNT(DISTINCT mr.reporter_user_id) >= ${MASS_REPORT_THRESHOLD}

      UNION ALL

      SELECT 'rss_feed_item' AS entity_type, mr.rss_feed_item_id::text AS entity_id
      FROM moderation_reports mr
      JOIN rss_feed_items rfi ON rfi.id = mr.rss_feed_item_id AND rfi.deleted_at IS NULL
      WHERE mr.rss_feed_item_id IS NOT NULL
        AND mr.reviewed_at IS NULL
        AND mr.id >= ${windowStartId}
      GROUP BY mr.rss_feed_item_id
      HAVING COUNT(DISTINCT mr.reporter_user_id) >= ${MASS_REPORT_THRESHOLD}
    ) sub`,
    { batchSize: BACKFILL_BATCH_SIZE },
  )) {
    batch.push({ entityType: row.entity_type, entityId: row.entity_id })
    if (batch.length >= BACKFILL_BATCH_SIZE) {
      /* v8 ignore start -- batch-full flush; requires seeding 500+ entities */
      yield batch
      batch = []
      /* v8 ignore stop */
    }
  }
  if (batch.length > 0) {
    yield batch
  }
}
