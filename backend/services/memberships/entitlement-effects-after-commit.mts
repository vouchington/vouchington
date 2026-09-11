import { registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'

export function registerEntitlementEffectsAfterCommit(
  query: QueryExecutor,
  enqueue: () => void | Promise<unknown>,
): void {
  registerPostCommitAction(query, () => {
    void enqueue()
    return Promise.resolve()
  })
}

export function membershipProjectionWithEntitlementEffects(
  query: QueryExecutor,
  enqueue: () => void | Promise<unknown>,
  membershipId: string,
  projected: boolean,
): { membershipId: string; projected: boolean } {
  if (projected) registerEntitlementEffectsAfterCommit(query, enqueue)
  return { membershipId, projected }
}
