import { registerPostCommitAction } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import type { ElectionVoteMutationResult } from './types.mts'

type VoteSideEffectOptions = {
  enqueueElectionStats: (entityIds: string[]) => Promise<unknown>
  afterUpsert?: (entityIds: string[], upsertedVotes: ElectionVoteMutationResult[]) => Promise<void>
}

export async function publishElectionVoteSideEffects(
  queryOptions: QueryOptions,
  options: VoteSideEffectOptions,
  entityIds: string[],
  upsertedVotes: ElectionVoteMutationResult[],
): Promise<void> {
  const publish = async () => {
    // Start stats admission before the strict afterUpsert callback, then join its factory-reported
    // outcome even if that callback fails. A committed vote must not fail on queue admission.
    const statsAdmission = awaitReportedEnqueueAdmission(() =>
      options.enqueueElectionStats(entityIds),
    )
    try {
      await options.afterUpsert?.(entityIds, upsertedVotes)
    } finally {
      await statsAdmission
    }
  }
  if (queryOptions.query) {
    registerPostCommitAction(queryOptions.query, publish)
  } else {
    await publish()
  }
}
