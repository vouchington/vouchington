import {
  getMembershipByStripeSubscriptionId,
  getRetainedDirectMembershipSourceByStripeIdentity,
} from '@services/memberships'
import type { Membership } from '@services/memberships/types'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import type { QueryExecutor } from '@data-stores/psql'

export type StripeMembershipSourceRoute = {
  membership: Membership | null
  retained:
    | Awaited<ReturnType<typeof getRetainedDirectMembershipSourceByStripeIdentity>>
    | undefined
}

export async function getLockedStripeMembershipSource(
  sourceIdentity: StripeMembershipSourceIdentity,
  query: QueryExecutor,
): Promise<StripeMembershipSourceRoute> {
  const membership = await getMembershipByStripeSubscriptionId(sourceIdentity, { query })
  const retained = membership
    ? undefined
    : await getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity, { query })
  return { membership, retained }
}
