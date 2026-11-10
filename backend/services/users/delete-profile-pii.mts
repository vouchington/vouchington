import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
  type ImageSurfaceMutationChange,
} from '@services/media-delivery-safety/surface-mutation-bindings'

/**
 * Soft-deletes a user row and scrubs all profile and verified-identity PII in one UPDATE.
 *
 * Returns the affected row count (0 if the user is already soft-deleted).
 * The caller is responsible for asserting > 0 and raising an appropriate error.
 *
 * `deleted_by_id` is a foreign key to `users`, so this UPDATE takes `KEY SHARE` on the actor row.
 * The caller must already hold the ordered `users` row locks from `lockUserDeletionRows`; locking
 * the actor here instead would reintroduce the reciprocal-deletion deadlock.
 *
 * Extracted from `deleteUser` to keep `delete.mts` under the 200-line oxlint cap.
 * Mirrors the `delete-oauth-pii.mts` precedent for encapsulating deletion-time scrubs.
 */
export async function softDeleteAndScrubUserProfile(
  userId: string,
  requestedById: string,
  query: TransactionQuery,
): Promise<{ rowCount: number; change: ImageSurfaceMutationChange | null }> {
  const references = [{ surfaceKind: 'user-profile-image' as const, userId, nextImageId: null }]
  const statement = imageSurfaceMutationPreimage(references, 'deleteUser')
  statement.append(sql`, deleted AS (
    UPDATE users
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = ${requestedById},
        username = NULL,
        markdown = '',
        verification_status = DEFAULT,
        verification_provider = NULL,
        verification_completed_at = NULL,
        is_verified_badge_visible = DEFAULT,
        public_verified_name_display = DEFAULT,
        verified_first_name = NULL,
        verified_last_name_initial = NULL,
        verified_full_name = NULL,
        pending_verification_session_id = NULL,
        pending_checkout_session_id = NULL
    FROM surface_preimage before
    WHERE users.id = ${userId} AND before.ordinality = 1
      AND users.deleted_at IS NULL
      AND users.profile_image_id IS NOT DISTINCT FROM before.current_image_id
    RETURNING WITH (OLD AS prior, NEW AS current)
      prior.profile_image_id AS previous_image_id,
      CASE WHEN current.deleted_at IS NULL THEN current.profile_image_id END AS current_image_id,
      before.placement_id AS previous_placement_id,
      before.placement_revision AS previous_placement_revision,
      before.activation_revision AS previous_activation_revision
  ) SELECT * FROM deleted`)
  const { rows } = await query<{
    previous_image_id: string | null
    current_image_id: string | null
    previous_placement_id: string | null
    previous_placement_revision: number | null
    previous_activation_revision: number | null
  }>(statement)
  const row = rows[0]
  return {
    rowCount: rows.length,
    change: row
      ? imageSurfaceMutationChange({
          ordinality: 1,
          previousImageId: row.previous_image_id,
          currentImageId: row.current_image_id,
          previousPlacementId: row.previous_placement_id,
          previousPlacementRevision: row.previous_placement_revision,
          previousActivationRevision: row.previous_activation_revision,
        })
      : null,
  }
}

/**
 * Revoke the document and remove its live account/session link for a deleted user.
 *
 * Must be called AFTER `softDeleteAndScrubUserProfile` (and only when that call confirms
 * the user was just soft-deleted) so the live link is removed only once deletion is confirmed.
 *
 * Intentionally placed in `@services/users` (not `@services/identity-verification`) to
 * avoid a circular workspace dependency: identity-verification → users → identity-verification.
 */
export async function revokeVerifiedIdentitiesForDeletedUser(
  userId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* deleteUser: revoke verified identities */
    WITH removed AS (
      DELETE FROM verified_identity_account_links WHERE user_id = ${userId}
      RETURNING identity_fingerprint
    )
    UPDATE verified_identities SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
    WHERE identity_fingerprint IN (SELECT identity_fingerprint FROM removed)
  `)
}
