import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { CONTRIBUTION_GATE_ACCOUNT_AGE_MS } from './config.mts'
import type { ContributionLimitMembershipPlan, ContributionLimitTier } from './limit-types.mts'

const contributionPolicyActorBrand = Symbol('contributionPolicyActor')

export type ContributionPolicyActor = Readonly<{
  [contributionPolicyActorBrand]: true
  tier: Exclude<ContributionLimitTier, 'admin'>
}>

export function createContributionPolicyActor(
  userId: string,
  membershipPlan: ContributionLimitMembershipPlan,
  now = Date.now(),
): ContributionPolicyActor {
  if (membershipPlan === 'pro') return createActor('pro')
  if (membershipPlan === 'plus') return createActor('plus')
  const createdAt = getDateFromUUIDv7(userId)
  return createActor(
    createdAt !== null && now - createdAt.getTime() < CONTRIBUTION_GATE_ACCOUNT_AGE_MS
      ? 'just_joined'
      : 'free',
  )
}

function createActor(tier: Exclude<ContributionLimitTier, 'admin'>): ContributionPolicyActor {
  return { [contributionPolicyActorBrand]: true, tier }
}
