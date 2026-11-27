import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const judgementBackfillTargetKinds = [
  'post',
  'user',
  'url_hostname',
  'rss_feed_item',
] as const
export type JudgementBackfillTargetKind = (typeof judgementBackfillTargetKinds)[number]

export type JudgementBackfillCursor = {
  target_kind: JudgementBackfillTargetKind
  cursor_target_id: string | null
  sweep_upper_bound_id: string | null
  is_sweep_complete: boolean
}

export async function readJudgementBackfillCursor(): Promise<JudgementBackfillCursor> {
  const { rows } = await write<JudgementBackfillCursor>(sql`/* readJudgementBackfillCursor */
    SELECT target_kind, cursor_target_id, sweep_upper_bound_id, is_sweep_complete
    FROM report_judgement_backfill_cursors
    WHERE is_singleton
  `)
  return rows[0]!
}

export async function advanceJudgementBackfillCursor(
  previous: JudgementBackfillCursor,
  next: JudgementBackfillCursor,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* advanceJudgementBackfillCursor */
    UPDATE report_judgement_backfill_cursors
    SET target_kind = ${next.target_kind},
        cursor_target_id = ${next.cursor_target_id},
        sweep_upper_bound_id = ${next.sweep_upper_bound_id},
        is_sweep_complete = ${next.is_sweep_complete}
    WHERE is_singleton
      AND target_kind = ${previous.target_kind}
      AND cursor_target_id IS NOT DISTINCT FROM ${previous.cursor_target_id}::uuid
      AND sweep_upper_bound_id IS NOT DISTINCT FROM ${previous.sweep_upper_bound_id}::uuid
      AND is_sweep_complete = ${previous.is_sweep_complete}
  `)
  return rowCount === 1
}
