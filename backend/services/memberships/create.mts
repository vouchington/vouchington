import { beginTransaction, registerPostCommitAction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import type {
  CreateMembershipOptions,
  MembershipProviderEvidenceDependency,
} from './create-types.mts'
import { createMembershipWithQuery } from './create/persist.mts'
import { getDirectTermEffectiveAt } from './direct-term-effective-at.mts'
import type { CreatedMembership } from './reconcile-source-projection.mts'
export { InvalidMembershipGrantSkuError } from './create-source.mts'
export { InvalidMembershipGrantUserError } from './create-source.mts'
export { grantMembership } from './grant.mts'

type CreateMembershipDependencies = {
  enqueueDeliverMembershipEntitlementEffects?: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort
  query?: QueryExecutor
} & MembershipProviderEvidenceDependency

export async function createMembership(
  options: CreateMembershipOptions,
  dependencies: CreateMembershipDependencies = {},
): Promise<CreatedMembership> {
  const enqueueEntitlementEffects =
    dependencies.enqueueDeliverMembershipEntitlementEffects ??
    enqueueDeliverMembershipEntitlementEffectsBestEffort
  const status = options.status ?? 'active'
  const effectiveAt = options.effectiveAt ?? new Date()
  const timingContext = {
    status,
    effectiveAt,
    directTermEffectiveAt: getDirectTermEffectiveAt(options, status, effectiveAt),
  }

  let membership: CreatedMembership
  if (dependencies.query) {
    membership = await createMembershipWithQuery(
      options,
      dependencies,
      enqueueEntitlementEffects,
      timingContext,
      dependencies.query,
    )
  } else {
    await using transaction = await beginTransaction()
    membership = await createMembershipWithQuery(
      options,
      dependencies,
      enqueueEntitlementEffects,
      timingContext,
      transaction,
    )
    await transaction.commit()
  }
  if (membership.projected && dependencies.query)
    registerPostCommitAction(dependencies.query, () => {
      void enqueueEntitlementEffects()
      return Promise.resolve()
    })
  else if (membership.projected) void enqueueEntitlementEffects()
  return membership
}
