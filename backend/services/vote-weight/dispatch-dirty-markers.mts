import { write } from '@data-stores/psql'
import type { VoteWeightDirtyMarkersData } from '@queues/vote-aggregation/enqueues/types-dispatch'
import sql from 'sql-template-strings'
import { getVoteWeightDispatchBatchSize } from './work-limits.mts'

export async function dispatchVoteWeightDirtyMarkers(
  data: VoteWeightDirtyMarkersData = {},
): Promise<{
  events: { userId: string; jobId: string }[]
  continuation: VoteWeightDirtyMarkersData | null
  hasMore: boolean
}> {
  const cap = getVoteWeightDispatchBatchSize()
  const query = sql`/* dispatchVoteWeightDirtyMarkers */
    SELECT id FROM users
    WHERE vote_weight_recalculated_at IS NULL
      AND deleted_at IS NULL
      AND vote_weight_admin_set_at IS NULL`
  if (data.afterId) query.append(sql` AND id > ${data.afterId}::uuid`)
  query.append(sql` ORDER BY id LIMIT ${cap}`)

  const { rows } = await write<{ id: string }>(query)
  const lastId = rows.at(-1)?.id
  const continuation = rows.length === cap && lastId ? { afterId: lastId } : null
  return {
    events: rows.map(({ id }) => ({ userId: id, jobId: `voteWeight__${id}__dirtyMarker` })),
    continuation,
    hasMore: continuation !== null,
  }
}
