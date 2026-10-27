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
      END::moderation_report_entity_types AS entity_type
    FROM moderation_report_judgements j
    LEFT JOIN posts p ON j.post_id IS NOT NULL AND p.id = j.post_id
    WHERE j.id = ${judgementId}::uuid
    LIMIT 1
  `)
  return (rows[0] as ModerationReportJudgement | undefined) ?? null
}

export async function getJudgementByRunId(
  runId: string,
): Promise<ModerationReportJudgement | null> {
  const { rows } = await read<{ id: string }>(sql`/* getJudgementByRunId */
    SELECT id FROM moderation_report_judgements WHERE run_id = ${runId}::uuid LIMIT 1
  `)
  return rows[0] ? getJudgementById(rows[0].id) : null
}

/** Whether an automatic (non-rerun) judgement already exists for this report. */
export async function hasAutomaticJudgementForReport(reportId: string): Promise<boolean> {
  const { rows } = await read<{ exists: boolean }>(sql`/* hasAutomaticJudgementForReport */
    SELECT EXISTS (
      SELECT 1 FROM moderation_report_judgements
      WHERE triggering_report_id = ${reportId}::uuid AND rerun_by_id IS NULL
    ) AS exists
  `)
  return rows[0]?.exists ?? false
}

export async function getReportJudgementRunResult(
  reportId: string,
  runId: string,
): Promise<{ completed: boolean; judgement_id: string | null }> {
  const { rows } = await read<{ id: string }>(sql`/* getReportJudgementRunResult */
    SELECT id FROM moderation_report_judgements
    WHERE run_id = ${runId}::uuid AND triggering_report_id = ${reportId}::uuid
    LIMIT 1
  `)
  return { completed: rows.length > 0, judgement_id: rows[0]?.id ?? null }
}
