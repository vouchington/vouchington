import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Soft-deletes a user row and scrubs all profile and verified-identity PII in one UPDATE.
 *
 * Returns the affected row count (0 if the user is already soft-deleted).
 * The caller is responsible for asserting > 0 and raising an appropriate error.
 *
 * Extracted from `deleteUser` to keep `delete.mts` under the 200-line oxlint cap.
 * Mirrors the `delete-oauth-pii.mts` precedent for encapsulating deletion-time scrubs.
 */
export async function softDeleteAndScrubUserProfile(
  userId: string,
  requestedById: string,
  query: TransactionQuery,
): Promise<number> {
  const { rowCount } = await query(sql`/* deleteUser */
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = ${requestedById},
        username = NULL,
        markdown = '',
        verification_status = DEFAULT,
        verification_provider = NULL,
        verification_completed_at = NULL,
        verified_badge_visible = DEFAULT,
        public_verified_name_display = DEFAULT,
        verified_first_name = NULL,
        verified_last_name_initial = NULL,
        verified_full_name = NULL,
        pending_verification_session_id = NULL,
        pending_checkout_session_id = NULL
    WHERE id = ${userId}
      AND deleted_at IS NULL
  `)
  return rowCount ?? 0
}

/**
 * Revoke all active verified-identity rows for a deleted user.
 *
 * Must be called AFTER `softDeleteAndScrubUserProfile` (and only when that call confirms
 * the user was just soft-deleted) so the document is freed only once deletion is confirmed.
 *
 * Intentionally placed in `@services/users` (not `@services/identity-verification`) to
 * avoid a circular workspace dependency: identity-verification → users → identity-verification.
 */
export async function revokeVerifiedIdentitiesForDeletedUser(
  userId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* deleteUser: revoke verified identities */
    UPDATE verified_identities
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND transferred_to_user_id IS NULL
  `)
}
