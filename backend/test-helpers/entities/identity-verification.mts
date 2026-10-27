import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type VerifiedIdentityFields = {
  verificationStatus?:
    | 'verified'
    | 'duplicate_id'
    | 'failed'
    | 'unverified'
    | 'identity_pending'
    | 'payment_pending'
  verificationProvider?: string | null
  verificationCompletedAt?: Date | null
  verifiedBadgeVisible?: boolean
  publicVerifiedNameDisplay?: 'hidden' | 'first_name' | 'first_name_last_initial' | 'full_name'
  verifiedFirstName?: string | null
  verifiedLastNameInitial?: string | null
  verifiedFullName?: string | null
  pendingVerificationSessionId?: string | null
  pendingCheckoutSessionId?: string | null
}

/**
 * Set identity-verification state on a user row for test setup.
 * Raw name values are test-only fixtures — never use real PII.
 */
export async function setUserVerificationFields(
  userId: string,
  fields: VerifiedIdentityFields,
): Promise<void> {
  await write(sql`/* setUserVerificationFields */
    UPDATE users
    SET verification_status = COALESCE(${fields.verificationStatus ?? null}::identity_verification_statuses, verification_status),
        is_verified_badge_visible = COALESCE(${fields.verifiedBadgeVisible ?? null}, is_verified_badge_visible),
        public_verified_name_display = COALESCE(${fields.publicVerifiedNameDisplay ?? null}::public_verified_name_displays, public_verified_name_display),
        verified_first_name = CASE WHEN ${fields.verifiedFirstName !== undefined} THEN ${fields.verifiedFirstName ?? null} ELSE verified_first_name END,
        verified_last_name_initial = CASE WHEN ${fields.verifiedLastNameInitial !== undefined} THEN ${fields.verifiedLastNameInitial ?? null} ELSE verified_last_name_initial END,
        verified_full_name = CASE WHEN ${fields.verifiedFullName !== undefined} THEN ${fields.verifiedFullName ?? null} ELSE verified_full_name END,
        pending_verification_session_id = CASE WHEN ${fields.pendingVerificationSessionId !== undefined} THEN ${fields.pendingVerificationSessionId ?? null} ELSE pending_verification_session_id END,
        pending_checkout_session_id = CASE WHEN ${fields.pendingCheckoutSessionId !== undefined} THEN ${fields.pendingCheckoutSessionId ?? null} ELSE pending_checkout_session_id END,
        verification_provider = CASE WHEN ${fields.verificationProvider !== undefined} THEN ${fields.verificationProvider ?? null} ELSE verification_provider END,
        verification_completed_at = CASE WHEN ${fields.verificationCompletedAt !== undefined} THEN ${fields.verificationCompletedAt ?? null} ELSE verification_completed_at END
    WHERE id = ${userId}
  `)
}

/**
 * Insert a verified_identities row for test setup.
 * Use a 64-character hex string for fingerprint (e.g. v7().replaceAll('-','').padEnd(64,'0')).
 * This is a test-only fixture — never insert real identity data.
 */
export async function insertTestVerifiedIdentity(
  userId: string,
  fingerprint: string,
  sessionId: string,
): Promise<void> {
  await write(sql`/* insertTestVerifiedIdentity */
    WITH inserted AS (
      INSERT INTO verified_identities (identity_fingerprint, first_verified_at)
      VALUES (decode(${fingerprint}, 'hex'), CURRENT_TIMESTAMP)
      RETURNING identity_fingerprint
    )
    INSERT INTO verified_identity_account_links (user_id, identity_fingerprint, provider_session_id)
    SELECT ${userId}, identity_fingerprint, ${sessionId} FROM inserted
  `)
}

/**
 * Read raw verification fields from the users table for assertion in tests.
 */
export async function getUserVerificationState(userId: string): Promise<{
  verification_status: string
  verification_provider: string | null
  verification_completed_at: Date | null
  is_verified_badge_visible: boolean
  public_verified_name_display: string
  pending_verification_session_id: string | null
  pending_checkout_session_id: string | null
  verified_first_name: string | null
  verified_last_name_initial: string | null
  verified_full_name: string | null
} | null> {
  const { rows } = await read(sql`/* getUserVerificationState */
    SELECT verification_status, verification_provider, verification_completed_at,
           is_verified_badge_visible, public_verified_name_display,
           pending_verification_session_id, pending_checkout_session_id,
           verified_first_name, verified_last_name_initial, verified_full_name
    FROM users
    WHERE id = ${userId}
  `)
  return (
    (rows[0] as
      | {
          verification_status: string
          verification_provider: string | null
          verification_completed_at: Date | null
          is_verified_badge_visible: boolean
          public_verified_name_display: string
          pending_verification_session_id: string | null
          pending_checkout_session_id: string | null
          verified_first_name: string | null
          verified_last_name_initial: string | null
          verified_full_name: string | null
        }
      | undefined) ?? null
  )
}

/**
 * Count live verified-identity links for a user.
 */
export async function countVerifiedIdentities(userId: string): Promise<number> {
  const { rows } = await read(sql`/* countVerifiedIdentities */
    SELECT COUNT(*)::int AS count
    FROM verified_identity_account_links
    WHERE user_id = ${userId}
  `)
  return (rows[0] as { count: number }).count
}

export async function getStoredVerifiedIdentityHash(fingerprint: string): Promise<Buffer | null> {
  const { rows } = await read<{ identity_fingerprint: Buffer }>(sql`
    /* getStoredVerifiedIdentityHash */
    SELECT identity_fingerprint FROM verified_identities
    WHERE identity_fingerprint = decode(${fingerprint}, 'hex')
  `)
  return rows[0]?.identity_fingerprint ?? null
}

export type IdentityVerificationAttemptState = {
  checkout_session_id: string | null
  consumed_at: Date | null
  grant_entitlement_attempt_id: string | null
  granted_by_id: string | null
  id: string
  released_at: Date | null
  source: string
}

/** Read a user's durable identity-verification attempt audit for lifecycle assertions. */
export async function getIdentityVerificationAttemptStates(
  userId: string,
): Promise<IdentityVerificationAttemptState[]> {
  const { rows } = await read(sql`/* getIdentityVerificationAttemptStates */
    SELECT id, source, grant_entitlement_attempt_id, granted_by_id, checkout_session_id, released_at, consumed_at
    FROM identity_verification_attempts
    WHERE user_id = ${userId}
    ORDER BY id
  `)
  return rows as IdentityVerificationAttemptState[]
}

/**
 * Read a verified_identities row by its fingerprint for assertion in tests.
 * Used after hard-delete to assert the permanent record has no account link.
 */
export async function getVerifiedIdentityByFingerprint(fingerprint: string): Promise<{
  user_id: string | null
  status: string
  revoked_at: Date | null
} | null> {
  const { rows } = await read(sql`/* getVerifiedIdentityByFingerprint */
    SELECT
      link.user_id,
      CASE
        WHEN identity.revoked_at IS NOT NULL THEN 'revoked'
        ELSE 'active'
      END AS status,
      identity.revoked_at
    FROM verified_identities identity
    LEFT JOIN verified_identity_account_links link ON link.identity_fingerprint = identity.identity_fingerprint
    WHERE identity.identity_fingerprint = decode(${fingerprint}, 'hex')
    LIMIT 1
  `)
  return (
    (rows[0] as
      | {
          user_id: string | null
          status: string
          revoked_at: Date | null
        }
      | undefined) ?? null
  )
}
