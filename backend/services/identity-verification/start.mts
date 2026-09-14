import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { IDENTITY_VERIFICATION_CURRENCY } from '@voucha/config'
import type {
  CreateIdentityCheckoutSessionPayload,
  StripeCheckoutSessionResult,
} from '@modules/stripe/operations'
import { invalidate } from '@services/entity-cache/invalidate'
import type { PrivateUser } from '@services/users/types'
import { assertEligibleForIdentityVerification } from './eligibility.mts'
import {
  attachCheckoutToIdentityVerificationAttempt,
  releaseAttachedIdentityVerificationAttempt,
  releaseReservedIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from './attempts.mts'
import createHttpError from 'http-errors'

export type StartIdentityVerificationDependencies = {
  assertEligibleForIdentityVerification: typeof assertEligibleForIdentityVerification
  createIdentityCheckoutSession: (
    payload: Omit<
      CreateIdentityCheckoutSessionPayload,
      'customerIdempotencyKey' | 'checkoutIdempotencyKey'
    >,
  ) => Promise<StripeCheckoutSessionResult>
  invalidateUsers: typeof invalidate.users
  reserveAttempt: typeof reserveIdentityVerificationAttempt
  attachCheckoutToAttempt: typeof attachCheckoutToIdentityVerificationAttempt
  releaseAttempt: typeof releaseReservedIdentityVerificationAttempt
  releaseAttachedAttempt: typeof releaseAttachedIdentityVerificationAttempt
  beginTransaction: typeof beginTransaction
}

/**
 * Start an identity-verification flow: assert eligibility, create the Stripe Checkout
 * session, then atomically claim payment_pending and persist the session ID in one UPDATE.
 *
 * Stripe is called before the DB transition so there is no window where the row is in
 * payment_pending with a NULL pending_verification_session_id. If the DB claim fails
 * (concurrent request already claimed it), the Stripe session is orphaned but harmless —
 * Stripe checkout sessions expire automatically and are not charged unless completed.
 */
export async function startIdentityVerification(
  currentUser: PrivateUser,
  opts: { successUrl: string; cancelUrl: string },
  dependencies: Pick<StartIdentityVerificationDependencies, 'createIdentityCheckoutSession'> &
    Partial<Omit<StartIdentityVerificationDependencies, 'createIdentityCheckoutSession'>>,
): Promise<{ url: string }> {
  const assertEligible =
    dependencies?.assertEligibleForIdentityVerification ?? assertEligibleForIdentityVerification
  const createCheckoutSession = dependencies.createIdentityCheckoutSession
  const begin = dependencies?.beginTransaction ?? beginTransaction
  const invalidateUsers = dependencies?.invalidateUsers ?? invalidate.users

  await assertEligible(currentUser)

  const reserveAttempt = dependencies?.reserveAttempt ?? reserveIdentityVerificationAttempt
  const attachCheckout =
    dependencies?.attachCheckoutToAttempt ?? attachCheckoutToIdentityVerificationAttempt
  const releaseAttempt = dependencies?.releaseAttempt ?? releaseReservedIdentityVerificationAttempt
  const releaseAttachedAttempt =
    dependencies?.releaseAttachedAttempt ?? releaseAttachedIdentityVerificationAttempt
  const attempt = await reserveAttempt(currentUser.id)

  // Create the Stripe customer and checkout session before claiming the DB row.
  // Concurrent requests that also reach this point will create orphaned sessions,
  // but only one can win the DB UPDATE below.
  let session: StripeCheckoutSessionResult
  try {
    session = await createCheckoutSession({
      userId: currentUser.id,
      ...(currentUser.email_address ? { email: currentUser.email_address } : {}),
      priceAmountMinorUnits: attempt.amountMinorUnits,
      currency: IDENTITY_VERIFICATION_CURRENCY,
      productName: 'Identity Verification',
      successUrl: opts.successUrl,
      cancelUrl: opts.cancelUrl,
      metadata: {
        intent: 'identity-verification',
        user_id: currentUser.id,
        identity_verification_attempt_id: attempt.id,
      },
    })
    if (!session.url) throw new Error('Stripe Checkout session missing URL')
    await attachCheckout(attempt.id, session.id)
  } catch (error) {
    await releaseAttempt(attempt.id).catch(onError)
    throw error
  }

  if (!session.url) throw new Error('Stripe Checkout session missing URL')

  // Atomically mark this exact attempt and persist the user's Checkout claim. The durable
  // attempt marker distinguishes an acknowledgement-lost committed claim from a concurrent loser.
  let claimCommitted = false
  try {
    await using transaction = await begin()
    const { rows } = await transaction(
      sql`/* startIdentityVerification:claim-and-persist */
      WITH eligible_user AS (
        SELECT id FROM users
        WHERE id = ${currentUser.id}
          AND deleted_at IS NULL
          AND verification_status IN ('unverified', 'failed')
        ORDER BY id
        FOR UPDATE
      ), claimed_attempt AS (
        UPDATE identity_verification_attempts
        SET checkout_claimed_at = CURRENT_TIMESTAMP
        WHERE id = ${attempt.id}
          AND checkout_session_id = ${session.id}
          AND checkout_claimed_at IS NULL
          AND released_at IS NULL
          AND consumed_at IS NULL
          AND EXISTS (SELECT 1 FROM eligible_user)
        RETURNING id
      ), claimed_user AS (
        UPDATE users
        SET verification_status = 'payment_pending',
            verification_provider = 'stripe_identity',
            verification_completed_at = NULL,
            pending_verification_session_id = ${session.id},
            pending_checkout_session_id = NULL
        WHERE id = ${currentUser.id}
          AND EXISTS (SELECT 1 FROM eligible_user)
          AND EXISTS (SELECT 1 FROM claimed_attempt)
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM claimed_attempt)
        AND EXISTS (SELECT 1 FROM claimed_user) AS claim_committed
      `,
    )
    await transaction.commit()
    claimCommitted =
      (rows[0] as { claim_committed?: boolean } | undefined)?.claim_committed === true
  } catch (error) {
    await using transaction = await begin()
    const { rows } = await transaction(sql`/* startIdentityVerification:recover-ambiguous-claim */
        SELECT checkout_claimed_at
        FROM identity_verification_attempts
        WHERE id = ${attempt.id}
          AND checkout_session_id = ${session.id}
        LIMIT 1
      `)
    await transaction.commit()
    const recovered = rows[0] as { checkout_claimed_at?: Date | null } | undefined
    if (recovered?.checkout_claimed_at) {
      await invalidateUsers(currentUser.id).catch(onError)
      return { url: session.url }
    }
    await releaseAttachedAttempt(attempt.id, session.id).catch(onError)
    throw error
  }

  if (!claimCommitted) {
    await releaseAttachedAttempt(attempt.id, session.id).catch(onError)
    throw createHttpError(409, 'A verification request is already in progress for this account.')
  }

  // Best-effort: the checkout session and DB transition already succeeded; a cache
  // invalidation failure must not prevent the client from receiving the checkout URL.
  await invalidateUsers(currentUser.id).catch(onError)
  return { url: session.url }
}
