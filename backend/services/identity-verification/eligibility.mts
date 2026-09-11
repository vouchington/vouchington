import createHttpError from 'http-errors'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { EMAIL_VERIFICATION_REQUIRED } from '@modules/on-error/error-codes'
import { assertNotSuspended } from '@services/users/suspension'
import { hasVerifiedNonDisposableEmail } from '@services/contribution-gating/email-verification'
import type { PrivateUser } from '@services/users/types'

/**
 * Assert that the current user is eligible to start an identity-verification flow.
 * Throws an HTTP error if not eligible.
 */
export async function assertEligibleForIdentityVerification(
  currentUser: PrivateUser,
): Promise<void> {
  assertNotSuspended(currentUser)

  const hasEmail = await hasVerifiedNonDisposableEmail(currentUser.id)
  if (!hasEmail) {
    throw createCodedError(
      422,
      'A verified non-disposable email address is required before identity verification.',
      EMAIL_VERIFICATION_REQUIRED,
    )
  }

  const status = currentUser.verification_status ?? 'unverified'
  if (status === 'verified') {
    throw createHttpError(409, 'Your account is already verified.')
  }
  // payment_pending is intentionally not rejected here: the DB claim WHERE in
  // startIdentityVerification only allows unverified/failed, so an active payment_pending
  // user still gets a 409 from the UPDATE guard.
  if (status === 'identity_pending') {
    throw createHttpError(409, 'An identity verification is already in progress.')
  }
  if (status === 'duplicate_id') {
    throw createHttpError(
      409,
      'Identity verification failed due to a duplicate document. Please contact support.',
    )
  }
}
