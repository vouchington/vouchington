/**
 * Re-enqueues the idempotent aggregate repair for an effective vote no-op without writing a new
 * append-only vote event. A prior committed vote may have outlived a transient queue failure.
 */
export function createVoteStatsNoopReconciler(
  enqueueElectionStats: (entityIds: string[]) => unknown,
  enqueueAdditionalRepair?: (entityIds: string[]) => unknown,
) {
  return (_currentUser: unknown, entityId: string): void => {
    const entityIds = [entityId]
    void enqueueElectionStats(entityIds)
    void enqueueAdditionalRepair?.(entityIds)
  }
}
