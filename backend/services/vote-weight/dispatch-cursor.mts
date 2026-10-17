import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { VoteWeightDispatchWindow } from '@queues/vote-aggregation/enqueues/types-dispatch'
import { getVoteWeightWindowOverlapSeconds } from './work-limits.mts'

export type VoteWeightDispatcher =
  | 'age_milestones'
  | 'membership_expirations'
  | 'family_source_changes'

export async function beginVoteWeightDispatch(
  dispatcher: VoteWeightDispatcher,
  now = new Date(),
): Promise<VoteWeightDispatchWindow> {
  await write(sql`/* ensureVoteWeightDispatchCursor */
    INSERT INTO vote_weight_recalculation_cursors (dispatcher)
    VALUES (${dispatcher}) ON CONFLICT DO NOTHING`)
  const { rows } = await write<{
    previous_through_at: string | null
    window_start: string | null
  }>(sql`/* beginVoteWeightDispatch */
    SELECT changes_through_at::text AS previous_through_at,
      (changes_through_at - ${getVoteWeightWindowOverlapSeconds()} * INTERVAL '1 second')::text AS window_start
    FROM vote_weight_recalculation_cursors WHERE dispatcher = ${dispatcher}`)
  return {
    previousThroughAt: rows[0]?.previous_through_at ?? null,
    windowStart: rows[0]?.window_start ?? null,
    windowEnd: now.toISOString(),
  }
}

/** Call only after every child enqueue succeeds; concurrent older runs cannot rewind the cursor. */
export async function completeVoteWeightDispatch(
  dispatcher: VoteWeightDispatcher,
  window: VoteWeightDispatchWindow,
  options: { query?: QueryExecutor } = {},
): Promise<void> {
  const query = options.query ?? write
  await query(sql`/* completeVoteWeightDispatch */
    UPDATE vote_weight_recalculation_cursors SET changes_through_at = ${window.windowEnd}::timestamptz
    WHERE dispatcher = ${dispatcher}
      AND changes_through_at IS NOT DISTINCT FROM ${window.previousThroughAt}::timestamptz
      AND (changes_through_at IS NULL OR changes_through_at <= ${window.windowEnd}::timestamptz)`)
}
