import { createCodedError } from '@modules/on-error/create-coded-error'
import {
  NEUTRAL_REQUIRES_EXISTING_BALLOT,
  OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
} from '@modules/on-error/error-codes'
import { isOfficialAccount } from '@services/users'
import type { PrivateUser } from '@services/users/types'

export function assertOfficialVoteMutationAccess(
  currentUser: PrivateUser,
  isClear: boolean,
  officialAccountAllowed: boolean,
): void {
  if (!isClear && !officialAccountAllowed && isOfficialAccount(currentUser)) {
    throw createCodedError(
      403,
      'Official accounts cannot create community trust signals.',
      OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
    )
  }
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
