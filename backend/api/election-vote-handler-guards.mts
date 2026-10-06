import { createCodedError } from '@modules/on-error/create-coded-error'
import {
  EMAIL_VERIFICATION_REQUIRED,
  NEUTRAL_REQUIRES_EXISTING_BALLOT,
} from '@modules/on-error/error-codes'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { assertWithinContributionQuota } from '@services/contribution-gating/quota'
import { createPlatformAccountVoteForbiddenError } from '@services/elections-votes/shared'
import { getUserActivePlan } from '@services/memberships'
import { isPlatformAccount } from '@services/users'
import type { PrivateUser } from '@services/users/types'

export function assertOfficialVoteMutationAccess(
  currentUser: PrivateUser,
  isClear: boolean,
  officialAccountAllowed: boolean,
): void {
  if (!isClear && !officialAccountAllowed && isPlatformAccount(currentUser)) {
    throw createPlatformAccountVoteForbiddenError()
  }
}

export async function assertVoteContributionAllowed(
  currentUser: PrivateUser,
  isAdmin: boolean,
  bypassContributionGating: boolean,
): Promise<void> {
  const membershipPlan = await getUserActivePlan(currentUser.id)
  if (!bypassContributionGating) {
    const contributionStatus = await getContributionStatus(currentUser, {
      membershipPlan,
      skipAccountAgeGate: true,
    })
    if (!contributionStatus.allowed) {
      throw createCodedError(
        403,
        'A verified non-disposable email address is required to vote.',
        EMAIL_VERIFICATION_REQUIRED,
      )
    }
  }
  await assertWithinContributionQuota(currentUser.id, isAdmin, membershipPlan)
}

export function assertNeutralRequiresExistingBallot(
  choice: string | null,
  currentVote: { choice: string } | null,
): void {
  if (choice === 'neutral' && currentVote === null) {
    throw createCodedError(
      422,
      'Neutral retracts an existing ballot and cannot be a first vote.',
      NEUTRAL_REQUIRES_EXISTING_BALLOT,
    )
  }
}
