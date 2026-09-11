import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { invalidate } from '@services/entity-cache/invalidate'

type TerminalSessionLifecycleDependencies = {
  invalidateUsers: typeof invalidate.users
  beginTransaction: typeof beginTransaction
}

export async function onCheckoutAbortedForIdentity(
  _eventId: string,
  eventData: Record<string, unknown>,
  dependencies?: Partial<TerminalSessionLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  const invalidateUsers = dependencies?.invalidateUsers ?? invalidate.users
  const metadata = eventData.metadata as Record<string, string> | undefined
  if (metadata?.intent !== 'identity-verification') return
  const userId = metadata?.user_id
  if (!userId) return
  const checkoutSessionId = eventData.id as string | undefined
  if (!checkoutSessionId) return

  await using transaction = await begin()
  const { rows } = await transaction(sql`/* onCheckoutAbortedForIdentity */
      WITH pending_user AS (
        SELECT id
        FROM users
        WHERE id = ${userId}
          AND deleted_at IS NULL
          AND verification_status = 'payment_pending'
          AND pending_verification_session_id = ${checkoutSessionId}
        FOR UPDATE
      ), released_attempt AS (
        UPDATE identity_verification_attempts
        SET released_at = CURRENT_TIMESTAMP
        WHERE checkout_session_id = ${checkoutSessionId}
          AND consumed_at IS NULL
          AND released_at IS NULL
          AND provider_creation_started_at IS NULL
          AND EXISTS (SELECT 1 FROM pending_user)
        RETURNING id
      )
      UPDATE users
      SET verification_status = 'unverified',
          verification_provider = NULL,
          pending_verification_session_id = NULL,
          pending_checkout_session_id = NULL
      WHERE id = ${userId}
        AND EXISTS (SELECT 1 FROM pending_user)
        AND EXISTS (SELECT 1 FROM released_attempt)
      RETURNING id
    `)
  await transaction.commit()
  if (!rows.length) return
  await invalidateUsers(userId)
}

export async function onVerificationSessionCanceled(
  _eventId: string,
  eventData: Record<string, unknown>,
  dependencies?: Partial<TerminalSessionLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  const invalidateUsers = dependencies?.invalidateUsers ?? invalidate.users
  const sessionId = eventData.id as string | undefined
  if (!sessionId) return

  await using transaction = await begin()
  const { rows } = await transaction(sql`/* onVerificationSessionCanceled */
      UPDATE users
      SET verification_status = 'unverified',
          verification_provider = NULL,
          pending_verification_session_id = NULL,
          pending_checkout_session_id = NULL
      WHERE deleted_at IS NULL
        AND verification_status = 'identity_pending'
        AND pending_verification_session_id = ${sessionId}
      RETURNING id
    `)
  await transaction.commit()
  await Promise.all((rows as { id: string }[]).map(row => invalidateUsers(row.id)))
}
