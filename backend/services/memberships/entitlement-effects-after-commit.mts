import { registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'

export function registerEntitlementEffectsAfterCommit(query: QueryExecutor): void {
  registerPostCommitAction(query, async () => {
    await enqueueDeliverMembershipEntitlementEffectsBestEffort()
  })
}

export function membershipProjectionWithEntitlementEffects(
  query: QueryExecutor,
  membershipId: string,
  projected: boolean,
): { membershipId: string; projected: boolean } {
  if (projected) registerEntitlementEffectsAfterCommit(query)
  return { membershipId, projected }
}
