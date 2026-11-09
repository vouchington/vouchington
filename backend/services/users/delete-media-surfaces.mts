import type { TransactionQuery } from '@data-stores/psql'
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'
import { MAX_PROFILE_LINKS } from '@voucha/types/entities/user-constants'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  revokeVerifiedIdentitiesForDeletedUser,
  softDeleteAndScrubUserProfile,
} from './delete-profile-pii.mts'

export async function scrubUserDeletionIdentities(
  query: TransactionQuery,
  userId: string,
  requestedById: string,
): Promise<void> {
  // The caller holds the actual user row FOR UPDATE until deletion commits. Incoming
  // profile-link foreign keys cannot pass that row while this bounded set is captured.
  const { rows: currentLinks } = await query<{ id: string; image_id: string | null }>(sql`
    /* scrubUserDeletionIdentities:profileLinkImages */
    SELECT id, image_id FROM user_profile_links
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
    async (_before, scopeQuery) => {
      const softDeleteRowCount = await softDeleteAndScrubUserProfile(
        userId,
        requestedById,
        scopeQuery,
      )
      assert(softDeleteRowCount > 0, 409, 'User is already deleted')
      if (links.length === 0) return
      const { rowCount } = await scopeQuery(sql`
        /* scrubUserDeletionIdentities:deleteProfileLinks */
        DELETE FROM user_profile_links link
        USING unnest(${links.map(link => link.id)}::uuid[],
          ${links.map(link => link.image_id)}::uuid[]) expected(id, image_id)
        WHERE link.id = expected.id AND link.user_id = ${userId}
          AND link.image_id IS NOT DISTINCT FROM expected.image_id
      `)
      assert(rowCount === links.length, 409, 'Profile link images changed during deletion')
    },
  )
  await revokeVerifiedIdentitiesForDeletedUser(userId, query)
}
