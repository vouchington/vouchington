import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationReportJudgement } from './judgements.mts'

export async function getJudgementById(
  judgementId: string,
): Promise<ModerationReportJudgement | null> {
  const { rows } = await read<ModerationReportJudgement>(sql`/* getJudgementById */
    SELECT
      j.id,
      j.case_id,
      j.triggering_report_id,
      j.rerun_by_id,
      j.recommended_action,
      j.public_response,
      j.internal_response,
      j.model,
      j.context_hash,
      j.context_report_count,
      j.context_note_hash,
      j.context_max_reason_rank,
      j.created_at,
      j.dispatched_at,
      COALESCE(j.post_id, j.reported_user_id, j.hostname_id, j.rss_feed_item_id) AS entity_id,
      CASE
        WHEN j.post_id IS NOT NULL AND p.post_type = 'comment' THEN 'comment'
        WHEN j.post_id IS NOT NULL THEN 'post'
        WHEN j.reported_user_id IS NOT NULL THEN 'user'
        WHEN j.hostname_id IS NOT NULL THEN 'url_hostname'
        WHEN j.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
      END::moderation_report_entity_type AS entity_type
    FROM moderation_report_judgements j
    LEFT JOIN posts p ON j.post_id IS NOT NULL AND p.id = j.post_id
    WHERE j.id = ${judgementId}::uuid
    LIMIT 1
  `)
  return (rows[0] as ModerationReportJudgement | undefined) ?? null
}
