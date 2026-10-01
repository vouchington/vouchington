import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import {
  publishEntityRelationElectionVoteStats,
  updateEntityRelationElectionVoteStatsFromPrimaryBatch,
} from '@services/elections-votes/entity-relation/vote-stats-batch'

/** Recomputes category scores atomically and publishes their cache and notification effects later. */
export async function refreshPostCategoryVoteStatsInTransaction(
  query: TransactionQuery,
  postId: string,
  relationIdsByTable: ReadonlyMap<string, readonly string[]>,
): Promise<void> {
  const targets = [...relationIdsByTable].flatMap(([relationTable, relationIds]) =>
    relationIds.map(entityRelationId =>
      createEntityRelationElectionTarget(entityRelationId, relationTable),
    ),
  )
  const changedTargets =
    targets.length === 0
      ? []
      : await updateEntityRelationElectionVoteStatsFromPrimaryBatch(targets, {
          query,
          invalidateCache: false,
          enqueueTopHashtagRefresh: false,
        })

  registerPostCommitAction(query, async () => {
    await Promise.all([
      changedTargets.length > 0
        ? publishEntityRelationElectionVoteStats(changedTargets)
        : Promise.resolve(),
      enqueueReconcilePostNotifications(postId),
    ])
  })
}
