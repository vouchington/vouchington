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
  dependencies?: Partial<VerifiedIdentityTransactionDependencies>,
): Promise<'verified' | 'already_verified' | 'duplicate' | 'noop'> {
  const begin = dependencies?.beginTransaction ?? beginTransaction
  await using transaction = await begin()
  async function completeVerifiedIdentityInTransaction(query: typeof transaction) {
    // Check whether we already processed this exact session (idempotent re-delivery)
    const { rows: existingRows } = await query(sql`/* onVerificationSessionVerified:existing */
      SELECT user_id FROM verified_identity_account_links
      WHERE provider_session_id = ${sessionId}
      LIMIT 1
    `)
    if (existingRows.length > 0) {
      // The core identity transition already committed. Report this separately from
      // a guard no-op so event replay can finish a previously failed vote refresh.
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

    // The permanent hash prevents document reuse even after revocation or account deletion.
    const { rows: collisionRows } = await query(sql`/* onVerificationSessionVerified:collision */
      SELECT identity_fingerprint FROM verified_identities
      WHERE identity_fingerprint = decode(${fingerprint}, 'hex')
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

    // Insert the minimum permanent record. A concurrent insert of the same hash wins the
    // unique constraint; only its own live account link can treat replay as success.
    const { rows: insertedRows } = await query(sql`/* onVerificationSessionVerified:insert */
      INSERT INTO verified_identities (identity_fingerprint, first_verified_at, last_verified_at)
      VALUES (decode(${fingerprint}, 'hex'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (identity_fingerprint) DO NOTHING
      RETURNING identity_fingerprint
    `)

    // ON CONFLICT DO NOTHING returned 0 rows — check whether it was this same session
    // (concurrent re-delivery) or a different user's document winning the race.
    if (insertedRows.length === 0) {
      const { rows: ownSessionRows } =
        await query(sql`/* onVerificationSessionVerified:own-session */
        SELECT user_id FROM verified_identity_account_links
        WHERE provider_session_id = ${sessionId} AND user_id = ${userId}
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

    await query(sql`/* onVerificationSessionVerified:link */
      INSERT INTO verified_identity_account_links (user_id, identity_fingerprint, provider_session_id)
      VALUES (${userId}, ${insertedRows[0]!.identity_fingerprint}, ${sessionId})
    `)

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

    // A lifecycle change after the guard means this document was never verified. Remove
    // only the fingerprint inserted by this transaction so a later real verification can
    // use it. Fingerprints from earlier successful verifications must remain retained.
    if (!updatedRows) {
      await query(sql`/* onVerificationSessionVerified:discard-unverified */
        WITH removed AS (
          DELETE FROM verified_identity_account_links
          WHERE provider_session_id = ${sessionId} AND user_id = ${userId}
            AND identity_fingerprint = ${insertedRows[0]!.identity_fingerprint}
          RETURNING identity_fingerprint
        )
        DELETE FROM verified_identities
        WHERE identity_fingerprint IN (SELECT identity_fingerprint FROM removed)
      `)
      return 'noop' as const
    }

    return 'verified' as const
  }
  const result = await completeVerifiedIdentityInTransaction(transaction)
  await transaction.commit()
  return result
}
