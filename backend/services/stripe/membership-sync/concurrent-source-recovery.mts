import { getMembershipByStripeSubscriptionId } from '@services/memberships'
import type {
  StripeMembershipApplicationContext,
  StripeMembershipSourceIdentity,
} from '@services/memberships/create-types'
import { syncMembershipFromStripeSubscription } from './sync-existing.mts'

type ConcurrentStripeMembershipSourceRecoveryDependencies = {
  getMembershipByStripeSubscriptionId: typeof getMembershipByStripeSubscriptionId
  syncMembershipFromStripeSubscription: typeof syncMembershipFromStripeSubscription
}

const defaultDependencies: ConcurrentStripeMembershipSourceRecoveryDependencies = {
  getMembershipByStripeSubscriptionId,
  syncMembershipFromStripeSubscription,
}

export async function recoverConcurrentStripeMembershipSource(
  error: unknown,
  options: {
    eventId: string
    subscriptionId: string
    sourceIdentity: StripeMembershipSourceIdentity
    applicationContext: StripeMembershipApplicationContext
    dependencies?: ConcurrentStripeMembershipSourceRecoveryDependencies
  },
): Promise<boolean> {
  if (!isUniqueConstraintError(error)) return false
  const dependencies = options.dependencies ?? defaultDependencies
  const membership = await dependencies.getMembershipByStripeSubscriptionId(options.sourceIdentity)
  if (!membership) return false
  await dependencies.syncMembershipFromStripeSubscription(
    options.eventId,
    options.subscriptionId,
    options.applicationContext,
  )
  return true
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code: string }).code === '23505'
}
