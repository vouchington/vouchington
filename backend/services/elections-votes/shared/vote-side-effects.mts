import { registerPostCommitAction } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { ElectionVoteMutationResult } from './types.mts'

type VoteSideEffectOptions = {
  enqueueElectionStats: (entityIds: string[]) => unknown
  afterUpsert?: (entityIds: string[], upsertedVotes: ElectionVoteMutationResult[]) => Promise<void>
}

export async function publishElectionVoteSideEffects(
  queryOptions: QueryOptions,
  options: VoteSideEffectOptions,
  entityIds: string[],
  upsertedVotes: ElectionVoteMutationResult[],
): Promise<void> {
  const publish = async () => {
    // Queue factories report failures internally; awaiting would turn a transient queue outage
    // into a user-facing failure after PostgreSQL has already committed the vote.
    void options.enqueueElectionStats(entityIds)
    await options.afterUpsert?.(entityIds, upsertedVotes)
  }
  if (queryOptions.query) {
    registerPostCommitAction(queryOptions.query, publish)
  } else {
    await publish()
  }
}
