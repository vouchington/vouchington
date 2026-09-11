import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache/invalidate'
import { stripeIdentityProvider } from './stripe-identity.mts'
import {
  abandonIdentityVerificationProviderSession,
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
  releaseIdentityVerificationAttempt,
} from './attempts.mts'
export {
  onCheckoutAbortedForIdentity,
  onVerificationSessionCanceled,
} from './webhook-session-terminal.mts'

type SessionLifecycleDependencies = {
  createVerificationSession: typeof stripeIdentityProvider.createVerificationSession
  invalidateUsers: typeof invalidate.users
  beginTransaction: typeof beginTransaction
  consumeAttempt: typeof consumeIdentityVerificationAttempt
  beginProviderSession: typeof beginIdentityVerificationProviderSession
  abandonProviderSession: typeof abandonIdentityVerificationProviderSession
  releaseAttempt: typeof releaseIdentityVerificationAttempt
}

/**
 * Called when checkout.session.completed with metadata.intent === 'identity-verification'
 * and payment_status === 'paid' or 'no_payment_required'.
 * Creates a Stripe Identity VerificationSession (with checkoutSessionId as idempotency key)
 * and sets verification_status = 'identity_pending'.
 * Idempotent: no-ops if the user is no longer in payment_pending for this checkout session.
 * Creates the Stripe session before claiming identity_pending so a crash leaves the user in
 * payment_pending — the event can be safely replayed.
 */
export async function onCheckoutCompletedForIdentity(
  _eventId: string,
  eventData: Record<string, unknown>,
  dependencies?: Partial<SessionLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  const createVerificationSession =
    dependencies?.createVerificationSession ?? stripeIdentityProvider.createVerificationSession
  const invalidateUsers = dependencies?.invalidateUsers ?? invalidate.users
  const consumeAttempt = dependencies?.consumeAttempt ?? consumeIdentityVerificationAttempt
  const beginProviderSession =
    dependencies?.beginProviderSession ?? beginIdentityVerificationProviderSession
  const abandonProviderSession =
    dependencies?.abandonProviderSession ?? abandonIdentityVerificationProviderSession
  const releaseAttempt = dependencies?.releaseAttempt ?? releaseIdentityVerificationAttempt
  if (eventData.payment_status !== 'paid' && eventData.payment_status !== 'no_payment_required')
    return

  const metadata = eventData.metadata as Record<string, string> | undefined
  if (metadata?.intent !== 'identity-verification') return
  const userId = metadata?.user_id
  if (!userId) return

  const checkoutSessionId = eventData.id as string | undefined
  if (!checkoutSessionId) return

  const publicUrl = process.env.PUBLIC_URL
  if (!publicUrl) throw new Error('PUBLIC_URL environment variable is not configured')

  // Pre-guard: skip if the user is no longer in payment_pending for this checkout session.
  // Handles replay idempotency and races with checkout.session.expired.
  await using preTransaction = await begin()
  const { rows: preRows } = await preTransaction(
    sql`/* onCheckoutCompletedForIdentity:pre-guard */
      SELECT id FROM users
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND verification_status = 'payment_pending'
        AND pending_verification_session_id = ${checkoutSessionId}
      LIMIT 1
    `,
  )
  await preTransaction.commit()
  if (!preRows.length) return

  const returnUrl = `${publicUrl}/my/identity-verification`

  // Use checkoutSessionId as the idempotency key so concurrent deliveries of the same
  // checkout.session.completed event both receive the same VerificationSession from Stripe.
  // Only the first DB UPDATE (below) will succeed; the other delivery sees 0 rows and returns
  // without creating a duplicate or orphaned session.
  // If this throws, the user remains in payment_pending and the webhook can be replayed.
  await beginProviderSession(checkoutSessionId)
  await using guardTransaction = await begin()
  const { rows: currentRows } = await guardTransaction(
    sql`/* onCheckoutCompletedForIdentity:post-reservation-guard */
      SELECT id FROM users
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND verification_status = 'payment_pending'
        AND pending_verification_session_id = ${checkoutSessionId}
      LIMIT 1
    `,
  )
  await guardTransaction.commit()
  if (!currentRows.length) {
    await abandonProviderSession(checkoutSessionId)
    await releaseAttempt(checkoutSessionId)
    return
  }
  // The provider may accept this idempotent request before a network error reaches us.
  // Keep the durable creation fence on failure so replay reconciles with the same key.
  const session = await createVerificationSession({
    userId,
    returnUrl,
    checkoutSessionId,
    idempotencyKey: checkoutSessionId,
  })

  // Provider-session creation is the irreversible boundary. Consume the reservation
  // before exposing the session, while an abandoned Checkout remains releasable.
  await consumeAttempt(checkoutSessionId, session.sessionId)

  // Single atomic UPDATE: claim identity_pending and persist the session in one shot.
  // The WHERE guard prevents double-application if a concurrent event already handled this.
  await using claimTransaction = await begin()
  const { rowCount } = await claimTransaction(
    sql`/* onCheckoutCompletedForIdentity:claim-and-persist */
      UPDATE users
      SET verification_status = 'identity_pending',
          pending_checkout_session_id = ${checkoutSessionId},
          pending_verification_session_id = ${session.sessionId}
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND verification_status = 'payment_pending'
        AND pending_verification_session_id = ${checkoutSessionId}
    `,
  )
  await claimTransaction.commit()

  if (!rowCount) return

  await invalidateUsers(userId)
}

/**
 * Called when identity.verification_session.requires_input fires.
 * In Stripe Identity, requires_input is recoverable — the user can retry document
 * upload on the same VerificationSession without a new payment.
 * We keep the status as identity_pending and invalidate the cache so the frontend
 * can prompt the user to resume. The session URL endpoint fetches a fresh URL.
 * Stripe may clear metadata on redacted sessions, so we match by session ID.
 */
export async function onVerificationSessionRequiresInput(
  _eventId: string,
  eventData: Record<string, unknown>,
  dependencies?: Partial<SessionLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  const invalidateUsers = dependencies?.invalidateUsers ?? invalidate.users
  const sessionId = eventData.id as string | undefined
  if (!sessionId) return

  await using transaction = await begin()
  const { rows } = await transaction(sql`/* onVerificationSessionRequiresInput */
      SELECT id FROM users
      WHERE deleted_at IS NULL
        AND verification_status = 'identity_pending'
        AND pending_verification_session_id = ${sessionId}
      LIMIT 1
    `)
  await transaction.commit()

  await Promise.all((rows as { id: string }[]).map(row => invalidateUsers(row.id)))
}
