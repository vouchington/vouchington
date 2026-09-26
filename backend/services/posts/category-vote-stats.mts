import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { PRIMARY_REFRESH_BATCH_SIZE } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { refreshEntityRelationVoteStatsBatchFromPrimaryWithFallback } from '@services/elections-votes/entity-relation/refresh-stats'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'

type CategoryVoteStatsDependencies = {
  refresh: typeof refreshEntityRelationVoteStatsBatchFromPrimaryWithFallback
  enqueueNotifications: typeof enqueueReconcilePostNotifications
}
const dependencies: CategoryVoteStatsDependencies = {
  refresh: refreshEntityRelationVoteStatsBatchFromPrimaryWithFallback,
  enqueueNotifications: enqueueReconcilePostNotifications,
}

/** One relation table and one atomic stats chunk per refresh/fallback boundary. */
export async function refreshPostCategoryVoteStats(
  postId: string,
  relationTable: string,
  relations: Array<{ id?: string }>,
  effects: CategoryVoteStatsDependencies = dependencies,
): Promise<void> {
  const targets = relations.flatMap(relation =>
    relation.id ? [createEntityRelationElectionTarget(relation.id, relationTable)] : [],
  )
  for (let offset = 0; offset < targets.length; offset += PRIMARY_REFRESH_BATCH_SIZE) {
    // oxlint-disable-next-line no-await-in-loop -- each committed chunk publishes before another chunk can fail.
    const changed = await effects.refresh(
      targets.slice(offset, offset + PRIMARY_REFRESH_BATCH_SIZE),
    )
    if (changed && changed.length > 0) void effects.enqueueNotifications(postId)
  }
}
