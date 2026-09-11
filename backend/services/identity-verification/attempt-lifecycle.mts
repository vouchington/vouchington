import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'

type AttemptLifecycleDependencies = {
  beginTransaction: typeof beginTransaction
}

export async function releaseIdentityVerificationAttempt(
  checkoutSessionId: string,
  dependencies?: Partial<AttemptLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  const { rowCount } = await transaction(sql`/* releaseIdentityVerificationAttempt */
      UPDATE identity_verification_attempts
      SET released_at = CURRENT_TIMESTAMP
      WHERE checkout_session_id = ${checkoutSessionId}
        AND checkout_claimed_at IS NULL
        AND provider_creation_started_at IS NULL
        AND consumed_at IS NULL
        AND released_at IS NULL
    `)
  await transaction.commit()
  if ((rowCount ?? 0) > 1)
    throw new Error('Identity verification release affected multiple attempts.')
}

export async function releaseAttachedIdentityVerificationAttempt(
  attemptId: string,
  checkoutSessionId: string,
  dependencies?: Partial<AttemptLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  const { rowCount } = await transaction(sql`/* releaseAttachedIdentityVerificationAttempt */
      UPDATE identity_verification_attempts
      SET released_at = CURRENT_TIMESTAMP
      WHERE id = ${attemptId}
        AND checkout_session_id = ${checkoutSessionId}
        AND checkout_claimed_at IS NULL
        AND provider_creation_started_at IS NULL
        AND consumed_at IS NULL
        AND released_at IS NULL
    `)
  await transaction.commit()
  if (rowCount !== 1)
    throw createHttpError(409, 'Identity verification attempt is no longer available.')
}

export async function beginIdentityVerificationProviderSession(
  checkoutSessionId: string,
  dependencies?: Partial<AttemptLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  const { rowCount } = await transaction(sql`/* beginIdentityVerificationProviderSession */
      UPDATE identity_verification_attempts
      SET provider_creation_started_at = CURRENT_TIMESTAMP
      WHERE checkout_session_id = ${checkoutSessionId}
        AND provider_creation_started_at IS NULL
        AND consumed_at IS NULL
        AND released_at IS NULL
    `)
  await transaction.commit()
  if (rowCount === 1) return
  await using existingTransaction = await begin()
  const { rows } =
    await existingTransaction(sql`/* beginIdentityVerificationProviderSession:existing */
      SELECT provider_creation_started_at
      FROM identity_verification_attempts
      WHERE checkout_session_id = ${checkoutSessionId}
        AND provider_creation_started_at IS NOT NULL
        AND released_at IS NULL
      LIMIT 1
    `)
  await existingTransaction.commit()
  if (rows.length === 1) return
  throw createHttpError(409, 'Identity verification attempt is no longer available.')
}

export async function abandonIdentityVerificationProviderSession(
  checkoutSessionId: string,
  dependencies?: Partial<AttemptLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  await transaction(sql`/* abandonIdentityVerificationProviderSession */
      UPDATE identity_verification_attempts
      SET provider_creation_started_at = NULL
      WHERE checkout_session_id = ${checkoutSessionId}
        AND provider_session_id IS NULL
        AND consumed_at IS NULL
    `)
  await transaction.commit()
}

export async function consumeIdentityVerificationAttempt(
  checkoutSessionId: string,
  providerSessionId: string,
  dependencies?: Partial<AttemptLifecycleDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  const { rowCount } = await transaction(sql`/* consumeIdentityVerificationAttempt */
      UPDATE identity_verification_attempts
      SET consumed_at = CURRENT_TIMESTAMP, provider_session_id = ${providerSessionId}
      WHERE checkout_session_id = ${checkoutSessionId}
        AND provider_creation_started_at IS NOT NULL
        AND released_at IS NULL
        AND consumed_at IS NULL
    `)
  await transaction.commit()
  if (rowCount === 1) return
  await using existingTransaction = await begin()
  const { rows } = await existingTransaction(
    sql`/* consumeIdentityVerificationAttempt:existing */
      SELECT provider_session_id FROM identity_verification_attempts
      WHERE checkout_session_id = ${checkoutSessionId} AND consumed_at IS NOT NULL
      LIMIT 1
    `,
  )
  await existingTransaction.commit()
  const existing = rows[0] as { provider_session_id?: string } | undefined
  if (existing?.provider_session_id === providerSessionId) return
  throw createHttpError(409, 'Identity verification attempt is no longer available.')
}
