import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  VoteWeightDispatchPage,
  VoteWeightMembershipExpirationsData,
} from '@queues/vote-aggregation/enqueues/types-dispatch'
import { beginVoteWeightDispatch } from './dispatch-cursor.mts'
import { getVoteWeightDispatchBatchSize } from './work-limits.mts'

export async function dispatchVoteWeightMembershipExpirations(
  data: VoteWeightMembershipExpirationsData = {},
): Promise<VoteWeightDispatchPage<VoteWeightMembershipExpirationsData>> {
  const window = data.window ?? (await beginVoteWeightDispatch('membership_expirations'))
  const cap = getVoteWeightDispatchBatchSize()
  const query = sql`/* dispatchVoteWeightMembershipExpirations */
    SELECT expires_at::text AS at, id, user_id FROM memberships
    WHERE projection_ended_at IS NULL AND cancelled_at IS NULL AND expired_at IS NULL
      AND past_due_at IS NULL AND paused_at IS NULL AND expires_at IS NOT NULL
      AND expires_at <= ${window.windowEnd}::timestamptz`
  if (window.windowStart) query.append(sql` AND expires_at >= ${window.windowStart}::timestamptz`)
  if (data.after)
    query.append(
      sql` AND (expires_at, id) > (${data.after.at}::timestamptz, ${data.after.id}::uuid)`,
    )
  query.append(sql` ORDER BY expires_at, id LIMIT ${cap}`)
  const { rows } = await write<{ at: string; id: string; user_id: string }>(query)
  const last = rows.at(-1)
  const continuation =
    rows.length === cap && last ? { window, after: { at: last.at, id: last.id } } : null
  return {
    window,
    events: rows.map(row => ({
      userId: row.user_id,
      jobId: `voteWeight__${row.user_id}__membershipExpired__${row.id}`,
    })),
    continuation,
    hasMore: continuation !== null,
  }
}
