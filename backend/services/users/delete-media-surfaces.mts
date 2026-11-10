import type { TransactionQuery } from '@data-stores/psql'
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'
import { MAX_PROFILE_LINKS } from '@voucha/types/entities/user-constants'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  revokeVerifiedIdentitiesForDeletedUser,
  softDeleteAndScrubUserProfile,
} from './delete-profile-pii.mts'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'

export async function scrubUserDeletionIdentities(
  query: TransactionQuery,
  userId: string,
  requestedById: string,
): Promise<void> {
  // The caller holds the actual user row FOR UPDATE until deletion commits. Incoming
  // profile-link foreign keys cannot pass that row while this bounded set is captured.
  const { rows: currentLinks } = await query<{ id: string }>(sql`
    /* scrubUserDeletionIdentities:profileLinkImages */
    SELECT id FROM user_profile_links
    WHERE user_id = ${userId}
    ORDER BY sort_order ASC LIMIT ${MAX_PROFILE_LINKS + 1}
  `)
  assert(currentLinks.length <= MAX_PROFILE_LINKS, 409, 'Profile link limit exceeded')
  const links = currentLinks
  await writeImageSurfaceMutation(
    query,
    [
      { surfaceKind: 'user-profile-image', userId, nextImageId: null },
      ...links.map(link => ({
        surfaceKind: 'user-profile-link-image' as const,
        userProfileLinkId: link.id,
        nextImageId: null,
      })),
    ],
    null,
    async (references, scopeQuery) => {
      const userMutation = await softDeleteAndScrubUserProfile(userId, requestedById, scopeQuery)
      assert(userMutation.rowCount > 0 && userMutation.change, 409, 'User is already deleted')
      const changes = [userMutation.change]
      if (links.length > 0) {
        const linkReferences = references.slice(1)
        const statement = imageSurfaceMutationPreimage(
          linkReferences,
          'scrubUserDeletionIdentities:deleteProfileLinks',
        )
        statement.append(sql`, removed AS (
          DELETE FROM user_profile_links link
          USING surface_preimage before
          WHERE link.id = before.user_profile_link_id AND link.user_id = ${userId}
            AND link.image_id IS NOT DISTINCT FROM before.current_image_id
          RETURNING WITH (OLD AS prior)
            before.ordinality::int AS ordinality, prior.image_id AS previous_image_id,
            before.placement_id AS previous_placement_id,
            before.placement_revision AS previous_placement_revision,
            before.activation_revision AS previous_activation_revision
        ) SELECT * FROM removed`)
        const { rows: removed } = await scopeQuery<{
          ordinality: number
          previous_image_id: string | null
          previous_placement_id: string | null
          previous_placement_revision: number | null
          previous_activation_revision: number | null
        }>(statement)
        assert(removed.length === links.length, 409, 'Profile link images changed during deletion')
        changes.push(
          ...removed.map(row =>
            imageSurfaceMutationChange({
              ordinality: row.ordinality + 1,
              previousImageId: row.previous_image_id,
              currentImageId: null,
              previousPlacementId: row.previous_placement_id,
              previousPlacementRevision: row.previous_placement_revision,
              previousActivationRevision: row.previous_activation_revision,
            }),
          ),
        )
      }
      return { result: undefined, changes }
    },
  )
  await revokeVerifiedIdentitiesForDeletedUser(userId, query)
}
