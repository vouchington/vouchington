import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'

/**
 * Re-enqueues the idempotent aggregate repair for an effective vote no-op without writing a new
 * append-only vote event. A prior committed vote may have outlived a transient queue failure.
 */
export function createVoteStatsNoopReconciler(
  enqueueElectionStats: (entityIds: string[]) => Promise<unknown>,
  enqueueAdditionalRepair?: (entityIds: string[]) => Promise<unknown>,
) {
  return async (_currentUser: unknown, entityId: string): Promise<void> => {
    const entityIds = [entityId]
    const statsAdmission = awaitReportedEnqueueAdmission(() => enqueueElectionStats(entityIds))
    const additionalAdmission = enqueueAdditionalRepair
      ? awaitReportedEnqueueAdmission(() => enqueueAdditionalRepair(entityIds))
      : undefined
    await Promise.all([statsAdmission, additionalAdmission])
  }
}
