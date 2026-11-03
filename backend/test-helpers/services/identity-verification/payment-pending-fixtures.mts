import { v7 } from 'uuid'
import { createTestUser } from '../../entities/users.mts'
import { setUserVerificationFields } from '../../entities/identity-verification.mts'
import {
  attachCheckoutToIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../../../services/identity-verification/attempts.mts'

/** A user whose reserved attempt is attached to a Checkout this test owns, awaiting payment. */
export async function createPaymentPendingUser() {
  const user = await createTestUser()
  const attempt = await reserveIdentityVerificationAttempt(user.id)
  const checkoutSessionId = `cs_${v7()}`
  await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
  await setUserVerificationFields(user.id, {
    verificationStatus: 'payment_pending',
    verificationProvider: 'stripe_identity',
    pendingVerificationSessionId: checkoutSessionId,
  })
  return { user, attemptId: attempt.id, checkoutSessionId }
}
