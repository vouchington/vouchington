import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type MissingJudgementEntity = {
  entityType: string
  entityId: string
  triggeringReportId: string
}

const BACKFILL_BATCH_SIZE = 500

/**
 * Streams batches of entities that have moderation reports but no judgement row.
 * Covers all four FK columns (post_id, reported_user_id, hostname_id, rss_feed_item_id)
 * via a UNION ALL. For posts, JOINs to `posts` to distinguish post vs comment.
 * The triggering_report_id is the most recent report for each entity.
 */
export async function* streamEntitiesMissingJudgementBatches(): AsyncGenerator<
  MissingJudgementEntity[],
  void,
  unknown
> {
  let batch: MissingJudgementEntity[] = []
  for await (const row of createAsyncGeneratorFromCursor<{
    entity_type: string
    entity_id: string
    triggering_report_id: string
  }>(
    sql`/* streamEntitiesMissingJudgementBatches */
    SELECT entity_type, entity_id, triggering_report_id FROM (
      (
        SELECT DISTINCT ON (mr.post_id)
          CASE WHEN p.post_type = 'comment' THEN 'comment' ELSE 'post' END AS entity_type,
          mr.post_id::text AS entity_id,
          mr.id AS triggering_report_id
        FROM moderation_reports mr
        JOIN posts p ON p.id = mr.post_id AND p.deleted_at IS NULL
        WHERE mr.post_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM moderation_report_judgements j WHERE j.post_id = mr.post_id
          )
        ORDER BY mr.post_id, mr.id DESC
      )

      UNION ALL

      (
        SELECT DISTINCT ON (mr.reported_user_id)
          'user' AS entity_type,
          mr.reported_user_id::text AS entity_id,
          mr.id AS triggering_report_id
        FROM moderation_reports mr
        JOIN users u ON u.id = mr.reported_user_id AND u.deleted_at IS NULL
        WHERE mr.reported_user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM moderation_report_judgements j
            WHERE j.reported_user_id = mr.reported_user_id
          )
        ORDER BY mr.reported_user_id, mr.id DESC
      )

      UNION ALL

      (
        SELECT DISTINCT ON (mr.hostname_id)
          'url_hostname' AS entity_type,
          mr.hostname_id::text AS entity_id,
          mr.id AS triggering_report_id
        FROM moderation_reports mr
        JOIN url_hostnames uh ON uh.id = mr.hostname_id AND uh.blocked IS NOT TRUE
        WHERE mr.hostname_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM moderation_report_judgements j WHERE j.hostname_id = mr.hostname_id
          )
        ORDER BY mr.hostname_id, mr.id DESC
      )

      UNION ALL

      (
        SELECT DISTINCT ON (mr.rss_feed_item_id)
          'rss_feed_item' AS entity_type,
          mr.rss_feed_item_id::text AS entity_id,
          mr.id AS triggering_report_id
        FROM moderation_reports mr
        JOIN rss_feed_items rfi ON rfi.id = mr.rss_feed_item_id AND rfi.deleted_at IS NULL
        WHERE mr.rss_feed_item_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM moderation_report_judgements j
            WHERE j.rss_feed_item_id = mr.rss_feed_item_id
          )
        ORDER BY mr.rss_feed_item_id, mr.id DESC
      )
    ) sub`,
    { batchSize: BACKFILL_BATCH_SIZE },
  )) {
    batch.push({
      entityType: row.entity_type,
      entityId: row.entity_id,
      triggeringReportId: row.triggering_report_id,
    })
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
