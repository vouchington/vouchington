import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

type VerifiedIdentityTransactionDependencies = {
  beginTransaction: typeof beginTransaction
}

/**
 * Runs the full verified-identity transaction: idempotency check, guard, fingerprint
 * collision check, verified_identities insert, and users status update.
 * Returns 'verified', 'already_verified', 'duplicate', or 'noop'.
 */
export async function runVerifiedIdentityTransaction(
  sessionId: string,
  userId: string,
  fingerprint: string,
  firstName: string | null,
  lastName: string | null,
  fullName: string | null,
  issuingCountry: string,
  documentType: string,
  checkoutSessionId: string,
  dependencies?: Partial<VerifiedIdentityTransactionDependencies>,
): Promise<'verified' | 'already_verified' | 'duplicate' | 'noop'> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  async function completeVerifiedIdentityInTransaction(query: typeof transaction) {
    // Check whether we already processed this exact session (idempotent re-delivery)
    const { rows: existingRows } = await query(sql`/* onVerificationSessionVerified:existing */
      SELECT user_id FROM verified_identities
      WHERE provider_session_id = ${sessionId}
      LIMIT 1
    `)
    if (existingRows.length > 0) {
      // The core identity transition already committed. Report this separately from
      // a guard no-op so webhook replay can finish a previously failed vote refresh.
      return 'already_verified' as const
    }

    // Guard: only process if the user is still identity_pending for this exact session.
    const { rows: statusRows } = await query(sql`/* onVerificationSessionVerified:guard */
      SELECT verification_status, pending_verification_session_id FROM users
      WHERE id = ${userId} AND deleted_at IS NULL
      LIMIT 1
    `)
    const userRow = statusRows[0] as
      | { verification_status: string; pending_verification_session_id: string | null }
      | undefined
    if (
      !userRow ||
      userRow.verification_status !== 'identity_pending' ||
      userRow.pending_verification_session_id !== sessionId
    ) {
      return 'noop' as const
    }

    // Check whether the fingerprint is already active on another account (duplicate document)
    const { rows: collisionRows } = await query(sql`/* onVerificationSessionVerified:collision */
      SELECT user_id FROM verified_identities
      WHERE identity_fingerprint = ${fingerprint}
        AND revoked_at IS NULL
        AND transferred_to_user_id IS NULL
      LIMIT 1
    `)
    if (collisionRows.length > 0) {
      await query(sql`/* onVerificationSessionVerified:duplicate */
        UPDATE users
        SET verification_status = 'duplicate_id',
            verification_completed_at = CURRENT_TIMESTAMP,
            pending_verification_session_id = NULL,
            pending_checkout_session_id = NULL
        WHERE id = ${userId}
          AND deleted_at IS NULL
          AND verification_status = 'identity_pending'
          AND pending_verification_session_id = ${sessionId}
      `)
      return 'duplicate' as const
    }

    // Insert the verified identity record; ON CONFLICT suppresses a concurrent duplicate
    const { rows: insertedRows } = await query(sql`/* onVerificationSessionVerified:insert */
      INSERT INTO verified_identities (
        user_id, provider, provider_session_id, identity_fingerprint,
        issuing_country, document_type, verified_at, checkout_session_id
      ) VALUES (
        ${userId}, 'stripe_identity', ${sessionId}, ${fingerprint},
        ${issuingCountry}, ${documentType}, CURRENT_TIMESTAMP, ${checkoutSessionId}
      )
      ON CONFLICT (identity_fingerprint)
      WHERE revoked_at IS NULL AND transferred_to_user_id IS NULL
      DO NOTHING
      RETURNING user_id
    `)

    // ON CONFLICT DO NOTHING returned 0 rows — check whether it was this same session
    // (concurrent re-delivery) or a different user's document winning the race.
    if (insertedRows.length === 0) {
      const { rows: ownSessionRows } =
        await query(sql`/* onVerificationSessionVerified:own-session */
        SELECT user_id FROM verified_identities
        WHERE provider_session_id = ${sessionId}
        LIMIT 1
      `)
      if (ownSessionRows.length > 0) {
        return 'verified' as const
      }
      await query(sql`/* onVerificationSessionVerified:duplicate */
        UPDATE users
        SET verification_status = 'duplicate_id',
            verification_completed_at = CURRENT_TIMESTAMP,
            pending_verification_session_id = NULL,
            pending_checkout_session_id = NULL
        WHERE id = ${userId}
          AND deleted_at IS NULL
          AND verification_status = 'identity_pending'
          AND pending_verification_session_id = ${sessionId}
      `)
      return 'duplicate' as const
    }

    const lastInitial = lastName?.charAt(0).toUpperCase() ?? null

    const { rowCount: updatedRows } = await query(sql`/* onVerificationSessionVerified:update */
      UPDATE users
      SET verification_status = 'verified',
          verification_completed_at = CURRENT_TIMESTAMP,
          pending_verification_session_id = NULL,
          pending_checkout_session_id = NULL,
          verified_first_name = ${firstName},
          verified_last_name_initial = ${lastInitial},
          verified_full_name = ${fullName}
      WHERE id = ${userId}
        AND deleted_at IS NULL
        AND verification_status = 'identity_pending'
        AND pending_verification_session_id = ${sessionId}
    `)

    // If the user row was not updated (concurrent lifecycle event changed the status
    // between the guard check and this UPDATE), deactivate the identity record we just
    // inserted to avoid an orphaned active record attached to a non-verified account.
    if (!updatedRows) {
      await query(sql`/* onVerificationSessionVerified:revoke */
        UPDATE verified_identities
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE provider_session_id = ${sessionId}
          AND revoked_at IS NULL
          AND transferred_to_user_id IS NULL
      `)
      return 'noop' as const
    }

    return 'verified' as const
  }
  const result = await completeVerifiedIdentityInTransaction(transaction)
  await transaction.commit()
  return result
}
