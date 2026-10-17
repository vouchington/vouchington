import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  VoteWeightAgeMilestonesData,
  VoteWeightDispatchPage,
} from '@queues/vote-aggregation/enqueues/types-dispatch'
import { beginVoteWeightDispatch } from './dispatch-cursor.mts'
import { getVoteWeightDispatchBatchSize } from './work-limits.mts'

export const VOTE_WEIGHT_AGE_MILESTONES = [
  '0 days',
  '7 days',
  '30 days',
  '1 year',
  '2 years',
  '5 years',
] as const

export async function dispatchVoteWeightAgeMilestones(
  data: VoteWeightAgeMilestonesData = {},
): Promise<VoteWeightDispatchPage<VoteWeightAgeMilestonesData>> {
  const window =
    data.window ??
    (await beginVoteWeightDispatch('age_milestones', new Date(), { fullReplay: data.fullReplay }))
  const milestoneIndex = data.milestoneIndex ?? 0
  const milestone = VOTE_WEIGHT_AGE_MILESTONES[milestoneIndex]
  if (milestone === undefined) throw new RangeError('Invalid vote-weight age milestone')
  const cap = getVoteWeightDispatchBatchSize()
  const query = sql`/* dispatchVoteWeightAgeMilestones */
    SELECT id FROM users
    WHERE id < fn_min_uuidv7(${window.windowEnd}::timestamptz - ${milestone}::interval)
      AND deleted_at IS NULL AND vote_weight_admin_set_at IS NULL`
  if (window.windowStart)
    query.append(sql`
    AND id >= fn_min_uuidv7(${window.windowStart}::timestamptz - ${milestone}::interval)`)
  if (data.afterId) query.append(sql` AND id > ${data.afterId}::uuid`)
  query.append(sql` ORDER BY id LIMIT ${cap}`)
  const { rows } = await write<{ id: string }>(query)
  const continuation =
    rows.length === cap
      ? { window, milestoneIndex, afterId: rows.at(-1)?.id }
      : milestoneIndex + 1 < VOTE_WEIGHT_AGE_MILESTONES.length
        ? { window, milestoneIndex: milestoneIndex + 1 }
        : null
  return {
    window,
    events: rows.map(({ id }) => ({
      userId: id,
      jobId: `voteWeight__${id}__age__${milestoneIndex}`,
    })),
    continuation,
    hasMore: continuation !== null,
  }
}
