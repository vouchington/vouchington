import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache/invalidate'
import { stripeIdentityProvider } from './stripe-identity.mts'
import { computeIdentityFingerprint } from './fingerprint.mts'
import { runVerifiedIdentityTransaction } from './event-completion-txn.mts'
import { enqueueElectionUpdatesForUser, recalculateUserVoteWeight } from '@services/vote-weight'

type VerificationSessionDependencies = {
  computeIdentityFingerprint: typeof computeIdentityFingerprint
  getVerificationResult: typeof stripeIdentityProvider.getVerificationResult
  invalidateUsers: typeof invalidate.users
  runVerifiedIdentityTransaction: typeof runVerifiedIdentityTransaction
  recalculateUserVoteWeight: typeof recalculateUserVoteWeight
  enqueueElectionUpdatesForUser: typeof enqueueElectionUpdatesForUser
  beginTransaction: typeof beginTransaction
}

/**
 * Called when identity.verification_session.verified fires.
 * Fetches verified outputs, computes fingerprint, attempts verified_identities insert.
 * On fingerprint collision → sets verification_status = 'duplicate_id'.
 * On success → sets verification_status = 'verified' and persists name fields.
 * Idempotent via pre-check on provider_session_id before inserting into verified_identities.
 */
export async function onVerificationSessionVerified(
  _eventId: string,
  eventData: Record<string, unknown>,
  dependencies?: Partial<VerificationSessionDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  const getVerificationResult =
    dependencies?.getVerificationResult ?? stripeIdentityProvider.getVerificationResult
  const computeFingerprint = dependencies?.computeIdentityFingerprint ?? computeIdentityFingerprint
  const runVerifiedTransaction =
    dependencies?.runVerifiedIdentityTransaction ?? runVerifiedIdentityTransaction
  const invalidateUsers = dependencies?.invalidateUsers ?? invalidate.users
  const recalculateVoteWeight = dependencies?.recalculateUserVoteWeight ?? recalculateUserVoteWeight
  const enqueueElectionUpdates =
    dependencies?.enqueueElectionUpdatesForUser ?? enqueueElectionUpdatesForUser
  const sessionId = eventData.id as string | undefined
  if (!sessionId) return

  // Resolve user_id from the session metadata.
  // Stripe may clear metadata on redacted sessions, so fall back to matching by session ID.
  const metadata = eventData.metadata as Record<string, string> | undefined
  let userId = metadata?.user_id
  let fallbackCheckoutSessionId: string | null = null

  if (!userId) {
    await using transaction = await begin()
    const { rows: fallbackRows } =
      await transaction(sql`/* onVerificationSessionVerified:user-fallback */
        SELECT id, pending_checkout_session_id FROM users
        WHERE deleted_at IS NULL
          AND (
            pending_verification_session_id = ${sessionId}
            OR EXISTS (
              SELECT 1 FROM verified_identities
              WHERE provider_session_id = ${sessionId} AND user_id = users.id
            )
          )
        LIMIT 1
      `)
    await transaction.commit()
    const fallbackRow = fallbackRows[0] as
      | { id: string; pending_checkout_session_id?: string | null }
      | undefined
    if (!fallbackRow) return
    userId = fallbackRow.id
    fallbackCheckoutSessionId = fallbackRow.pending_checkout_session_id ?? null
  }

  // Check a committed identity before the pending-state guard. Stripe retries after an external
  // side effect fails, so a later delivery must repair the vote-weight refresh and election enqueue
  // even though the durable identity transition has already cleared the pending session.
  await using transaction = await begin()
  const { rows: preRows } = await transaction(sql`/* onVerificationSessionVerified:pre-guard */
      SELECT verification_status, pending_verification_session_id, pending_checkout_session_id,
        EXISTS (
          SELECT 1 FROM verified_identities
          WHERE provider_session_id = ${sessionId} AND user_id = ${userId}
        ) AS identity_committed
      FROM users
      WHERE id = ${userId} AND deleted_at IS NULL
      LIMIT 1
    `)
  await transaction.commit()
  const preRow = preRows[0] as
    | {
        verification_status: string
        pending_verification_session_id: string | null
        pending_checkout_session_id: string | null
        identity_committed: boolean
      }
    | undefined
  if (!preRow) return
  if (preRow.identity_committed) {
    const { changed } = await recalculateVoteWeight(userId, { readFromWriter: true })
    if (changed || preRow.identity_committed) await enqueueElectionUpdates(userId)
    await invalidateUsers(userId)
    return
  }
  if (
    preRow.verification_status !== 'identity_pending' ||
    preRow.pending_verification_session_id !== sessionId
  )
    return
  const dbCheckoutSessionId = preRow.pending_checkout_session_id

  const result = await getVerificationResult(sessionId)

  // Session verified at Stripe but field extraction failed, OR the provider could not
  // extract documentNumber (requires_input from a verified event). Either way the user
  // must be transitioned out of identity_pending — there is no subsequent lifecycle event
  // that would clear it. Transition to 'failed' so the user can restart.
  if (result.outcome === 'failed' || result.outcome === 'requires_input') {
    await using transaction = await begin()
    const { rowCount } = await transaction(sql`/* onVerificationSessionVerified:extract-failed */
        UPDATE users
        SET verification_status = 'failed',
            verification_completed_at = CURRENT_TIMESTAMP,
            pending_verification_session_id = NULL,
            pending_checkout_session_id = NULL
        WHERE id = ${userId}
          AND deleted_at IS NULL
          AND verification_status = 'identity_pending'
          AND pending_verification_session_id = ${sessionId}
      `)
    await transaction.commit()
    if (rowCount) await invalidateUsers(userId)
    return
  }

  if (result.outcome !== 'verified') return

  const { firstName, lastName, fullName, documentNumber, issuingCountry, documentType } = result

  const fingerprint = computeFingerprint({ issuingCountry, documentType, documentNumber })
  // documentNumber is no longer referenced after this line — it must not be logged or stored.

  // Prefer metadata.checkout_session_id; fall back to DB (covers both the redacted-session path
  // and the case where metadata has user_id but lacks checkout_session_id).
  const checkoutSessionId =
    (metadata?.checkout_session_id as string | undefined) ??
    dbCheckoutSessionId ??
    fallbackCheckoutSessionId
  if (!checkoutSessionId) return

  const outcome = await runVerifiedTransaction(
    sessionId,
    userId,
    fingerprint,
    firstName,
    lastName,
    fullName,
    issuingCountry,
    documentType,
    checkoutSessionId,
    { beginTransaction: begin },
  )

  if (outcome === 'noop') return

  if (outcome === 'verified' || outcome === 'already_verified') {
    const { changed } = await recalculateVoteWeight(userId, { readFromWriter: true })
    // Replays must enqueue too: a prior delivery may have committed the identity
    // transaction and weight but failed before the aggregate refresh was enqueued.
    if (changed || outcome === 'already_verified') await enqueueElectionUpdates(userId)
  }
  await invalidateUsers(userId)
}
