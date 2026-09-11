import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_GATED, EMAIL_VERIFICATION_REQUIRED } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@voucha/types/entities/user'
import { CONTRIBUTION_GATE_ACCOUNT_AGE_MS } from './config.mts'
import { hasVerifiedNonDisposableEmail } from './email-verification.mts'
import type { ContributionGatingContext, ContributionStatus } from './types.mts'

/**
 * Returns the contribution status for a user without throwing.
 * Callers that need to throw on denial should use assertCanContribute.
 *
 * Decision tree:
 * 1. Admin → always allowed
 * 2. Active paid member (plus/pro) → always allowed
 * 3. Account < 7 days → gated (account_too_new), unless the caller opts out
 * 4. Has verified non-disposable email → allowed
 * 5. No verified email → gated (email_verification_required)
 */
export async function getContributionStatus(
  currentUser: PrivateUser,
  context: ContributionGatingContext,
): Promise<ContributionStatus> {
  // 1. Admin → always allowed
  if (currentUser.roles.includes('administrator')) return { allowed: true }

  // 2. Active paid member → always allowed
  if (context.membershipPlan) return { allowed: true }

  if (!context.skipAccountAgeGate && currentUser.verification_status !== 'verified') {
    // 3. Account < 7 days → gated (only applies to UUIDv7 IDs; non-UUIDv7 IDs don't exist in
    //    production since all users are created with the DB default uuidv7(), so null is skipped)
    const createdAt = getDateFromUUIDv7(currentUser.id)
    if (createdAt) {
      const ageMs = Date.now() - createdAt.getTime()
      if (ageMs < CONTRIBUTION_GATE_ACCOUNT_AGE_MS) {
        const gated_until = new Date(createdAt.getTime() + CONTRIBUTION_GATE_ACCOUNT_AGE_MS)
        return { allowed: false, reason: 'account_too_new', gated_until }
      }
    }
  }

  // 4. Has verified non-disposable email → allowed
  const hasEmail = await hasVerifiedNonDisposableEmail(currentUser.id)
  if (hasEmail) return { allowed: true }

  // 5. No verified email → gated
  return { allowed: false, reason: 'email_verification_required' }
}

/**
 * Asserts that the user is allowed to contribute.
 * Throws a 403 CONTRIBUTION_GATED error if not allowed.
 */
export async function assertCanContribute(
  currentUser: PrivateUser,
  context: ContributionGatingContext,
): Promise<void> {
  const status = await getContributionStatus(currentUser, context)
  if (!status.allowed) {
    const message =
      status.reason === 'account_too_new'
        ? 'Your account must be at least 7 days old to contribute. Please upgrade to a paid plan for immediate access.'
        : 'A verified email address is required to contribute.'
    const code =
      status.reason === 'email_verification_required'
        ? EMAIL_VERIFICATION_REQUIRED
        : CONTRIBUTION_GATED
    throw createCodedError(403, message, code)
  }
}
