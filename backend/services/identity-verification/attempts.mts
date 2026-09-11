import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { IDENTITY_VERIFICATION_FEE_MINOR_UNITS } from '@voucha/config'
import createHttpError from 'http-errors'

export type { IdentityVerificationAttempt } from './attempt-types.mts'
import type { IdentityVerificationAttempt } from './attempt-types.mts'

type AttemptDependencies = {
  beginTransaction: typeof beginTransaction
}

export {
  abandonIdentityVerificationProviderSession,
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
  releaseAttachedIdentityVerificationAttempt,
  releaseIdentityVerificationAttempt,
} from './attempt-lifecycle.mts'

/**
 * Atomically reserves either the account's single active/past-due Plus/Pro
 * entitlement or a normal self-paid attempt. A released Checkout is reusable;
 * creating a provider session consumes the entitlement permanently.
 */
export async function reserveIdentityVerificationAttempt(
  userId: string,
  dependencies?: Partial<AttemptDependencies>,
): Promise<IdentityVerificationAttempt> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  async function reserveAttemptInTransaction(query: typeof transaction) {
    const { rows: membershipRows } =
      await query(sql`/* reserveIdentityVerificationAttempt:membership */
      SELECT plan FROM view_memberships
      WHERE user_id = ${userId} AND status IN ('active', 'past_due') AND plan IN ('plus', 'pro')
      LIMIT 1
    `)
    const eligibleForIncluded = membershipRows.length > 0
    const { rows: grantAttemptRows } =
      await query(sql`/* reserveIdentityVerificationAttempt:support-grant */
        WITH candidate AS (
          SELECT entitlement.id, entitlement.user_id
          FROM identity_verification_attempts AS entitlement
          WHERE entitlement.user_id = ${userId}
            AND entitlement.source = 'support_grant'
            AND entitlement.grant_entitlement_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM identity_verification_attempts AS attempt
              WHERE attempt.grant_entitlement_id = entitlement.id
                AND attempt.released_at IS NULL
            )
          ORDER BY entitlement.id
          LIMIT 1
          /* deadlock-safe: SKIP LOCKED plus ORDER BY id */
          FOR UPDATE SKIP LOCKED
        )
        INSERT INTO identity_verification_attempts (user_id, source, grant_entitlement_id)
        SELECT user_id, 'support_grant', id FROM candidate
        ON CONFLICT (grant_entitlement_id) WHERE grant_entitlement_id IS NOT NULL AND released_at IS NULL
        DO NOTHING
        RETURNING id, source
      `)
    const grantAttempt = grantAttemptRows[0] as
      | { id: string; source: IdentityVerificationAttempt['source'] }
      | undefined
    if (grantAttempt) return { ...grantAttempt, amountMinorUnits: 0 }

    // A grant entitlement exists but its child is active (or being reserved). Do not let a
    // concurrent retry fall through and charge the user for a verification it already funds.
    const { rows: supportGrantRows } =
      await query(sql`/* reserveIdentityVerificationAttempt:support-grant-in-flight */
        SELECT id
        FROM identity_verification_attempts
        WHERE user_id = ${userId}
          AND source = 'support_grant'
          AND grant_entitlement_id IS NULL
        LIMIT 1
      `)
    if (!eligibleForIncluded && supportGrantRows.length) {
      throw createHttpError(
        409,
        'Your support-granted identity verification is already in progress.',
      )
    }

    if (!eligibleForIncluded) {
      const { rows: consumedFreeRows } =
        await query(sql`/* reserveIdentityVerificationAttempt:consumed-free */
        SELECT id FROM identity_verification_attempts
        WHERE user_id = ${userId}
          AND source = 'self_paid'
          AND consumed_at IS NOT NULL
        LIMIT 1
      `)
      if (consumedFreeRows.length > 0) {
        throw createHttpError(
          409,
          'Your identity verification attempt has completed. Contact support to request another attempt.',
        )
      }
    }

    const source = eligibleForIncluded ? 'membership_included' : 'self_paid'
    const { rows } = await query(sql`/* reserveIdentityVerificationAttempt:reserve */
      INSERT INTO identity_verification_attempts (user_id, source)
      VALUES (${userId}, ${source}::identity_verification_attempt_sources)
      ON CONFLICT (user_id) WHERE source = 'membership_included'
        AND released_at IS NULL
        AND user_id <> '00000000-0000-7000-8000-000000000000'::uuid
      DO NOTHING
      RETURNING id, source
    `)
    const row = rows[0] as { id: string; source: IdentityVerificationAttempt['source'] } | undefined
    if (!row) {
      throw createHttpError(
        409,
        'Your membership-included identity verification has already been used.',
      )
    }
    return {
      id: row.id,
      source: row.source,
      amountMinorUnits:
        row.source === 'membership_included' ? 0 : IDENTITY_VERIFICATION_FEE_MINOR_UNITS,
    }
  }
  const result = await reserveAttemptInTransaction(transaction)
  await transaction.commit()
  return result
}

export async function attachCheckoutToIdentityVerificationAttempt(
  attemptId: string,
  checkoutSessionId: string,
  dependencies?: Partial<AttemptDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  async function attachmentExists() {
    await using query = await begin()
    const result = await query(sql`/* attachCheckoutToIdentityVerificationAttempt:existing */
        SELECT id
        FROM identity_verification_attempts
        WHERE id = ${attemptId}
          AND checkout_session_id = ${checkoutSessionId}
          AND released_at IS NULL
          AND consumed_at IS NULL
      LIMIT 1
    `)
    await query.commit()
    return result
  }
  let rowCount: number | null | undefined
  try {
    await using query = await begin()
    const result = await query(sql`/* attachCheckoutToIdentityVerificationAttempt */
      UPDATE identity_verification_attempts
      SET checkout_session_id = ${checkoutSessionId}
      WHERE id = ${attemptId}
        AND checkout_session_id IS NULL
        AND released_at IS NULL
        AND consumed_at IS NULL
    `)
    await query.commit()
    ;({ rowCount } = result)
  } catch (error) {
    const { rows } = await attachmentExists()
    if (rows.length === 1) return
    throw error
  }
  if (rowCount === 1) return
  const { rows } = await attachmentExists()
  if (rows.length === 1) return
  throw createHttpError(409, 'Identity verification attempt is no longer available.')
}

export async function releaseReservedIdentityVerificationAttempt(
  attemptId: string,
  dependencies?: Partial<AttemptDependencies>,
): Promise<void> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using query = await begin()
  await query(sql`/* releaseReservedIdentityVerificationAttempt */
      UPDATE identity_verification_attempts
      SET released_at = CURRENT_TIMESTAMP
      WHERE id = ${attemptId}
        AND checkout_session_id IS NULL
        AND consumed_at IS NULL
        AND released_at IS NULL
    `)
  await query.commit()
}
