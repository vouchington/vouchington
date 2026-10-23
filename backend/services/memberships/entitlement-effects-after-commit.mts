import { registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'

export function registerEntitlementEffectsAfterCommit(
  query: QueryExecutor,
  enqueue: () => Promise<unknown>,
): void {
  registerPostCommitAction(query, async () => {
    await enqueue()
  })
}

export function membershipProjectionWithEntitlementEffects(
  query: QueryExecutor,
  enqueue: () => Promise<unknown>,
  membershipId: string,
  projected: boolean,
): { membershipId: string; projected: boolean } {
  if (projected) registerEntitlementEffectsAfterCommit(query, enqueue)
  return { membershipId, projected }
}
