import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMaxUUIDv7ForDate, getMinUUIDv7ForDate } from '@modules/utils/ids'

export async function markJudgementDispatched(judgementId: string): Promise<void> {
  await write(
    sql`/* markJudgementDispatched */
    UPDATE moderation_report_judgements
    SET dispatched_at = CURRENT_TIMESTAMP
    WHERE id = ${judgementId}::uuid
      AND dispatched_at IS NULL`,
  )
}

export async function getUndispatchedJudgements(): Promise<
  Array<{
    judgement_id: string
    entity_type: string
    entity_id: string
    community_id: string | null
  }>
> {
  const now = Date.now()
  const olderThanId = getMinUUIDv7ForDate(new Date(now - 2 * 60 * 1000))
  const newerThanId = getMaxUUIDv7ForDate(new Date(now - 30 * 60 * 1000))
  const { rows } = await read<{
    judgement_id: string
    entity_type: string
    entity_id: string
    community_id: string | null
  }>(sql`/* getUndispatchedJudgements */
    SELECT
      j.id AS judgement_id,
      COALESCE(j.post_id, j.reported_user_id, j.hostname_id, j.rss_feed_item_id) AS entity_id,
      CASE
        WHEN j.post_id IS NOT NULL AND p.post_type = 'comment' THEN 'comment'
        WHEN j.post_id IS NOT NULL THEN 'post'
        WHEN j.reported_user_id IS NOT NULL THEN 'user'
        WHEN j.hostname_id IS NOT NULL THEN 'url_hostname'
        WHEN j.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
      END AS entity_type,
      p.community_id
    FROM moderation_report_judgements j
    LEFT JOIN posts p ON j.post_id IS NOT NULL AND p.id = j.post_id
    WHERE j.dispatched_at IS NULL
      AND j.rerun_by_id IS NULL
      AND j.id < ${olderThanId}::uuid
      AND j.id > ${newerThanId}::uuid
    ORDER BY j.id
    LIMIT 200
  `)
  return rows
}
