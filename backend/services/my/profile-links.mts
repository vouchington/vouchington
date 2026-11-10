import { resolveProfileLinkUrlId } from './profile-links-url.mts'
import { MAX_PROFILE_LINKS } from '@voucha/types/entities/user-constants'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  assertImagesReadyForSurface,
  writeImageSurfaceMutation,
} from '@services/media-delivery-safety'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import {
  assertProfileLinkType,
  validateProfileLinkFields,
  type CreateProfileLinkInput,
} from './profile-links-input.mts'
import type { ProfileLink } from './profile-links-types.mts'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'
import { projectStoredProfileLink, type StoredProfileLink } from './profile-links-projection.mts'
export type { ProfileLink } from './profile-links-types.mts'

export { reorderProfileLinks } from './profile-links-reorder.mts'
export { listProfileLinks } from './profile-links-list.mts'
export type { ProfileLinkType } from './profile-links-input.mts'
export { MAX_PROFILE_LINKS } from '@voucha/types/entities/user-constants'
export async function createProfileLink(
  userId: string,
  input: CreateProfileLinkInput,
): Promise<ProfileLink> {
  assertProfileLinkType(input.link_type)
  validateProfileLinkFields(input.link_type, input.url, input.handle)
  const urlId = await resolveProfileLinkUrlId(userId, input.url)
  // Atomic INSERT: compute next sort_order and enforce per-user limit in one query.
  // HAVING COUNT(*) < MAX_PROFILE_LINKS prevents insert when at the limit.
  await using transaction = await beginTransaction()
  const imageIds = input.image_id ? [input.image_id] : []
  await assertImagesReadyForSurface(imageIds, transaction)
  const { rows } = await transaction(sql`/* createProfileLink */
    INSERT INTO user_profile_links (user_id, link_type, sort_order, url_id, handle, name, image_id)
    SELECT
      ${userId}::uuid,
      ${input.link_type}::user_profile_link_types,
      COALESCE(MAX(sort_order), -1) + 1,
      ${urlId},
      ${input.handle ?? null},
      ${input.name ?? null},
      NULL
    FROM user_profile_links
    WHERE user_id = ${userId}
    HAVING COUNT(*) < ${MAX_PROFILE_LINKS}
    RETURNING id, user_id, link_type, sort_order, url_id, handle, name, image_id, created_at, updated_at
  `)
  assert(rows.length > 0, 400, `Maximum of ${MAX_PROFILE_LINKS} profile links allowed`)
  let row = projectStoredProfileLink(rows[0] as StoredProfileLink)
  if (input.image_id) {
    const updated = await writeImageSurfaceMutation(
      transaction,
      [
        {
          surfaceKind: 'user-profile-link-image',
          userProfileLinkId: row.id,
          nextImageId: input.image_id,
        },
      ],
      userId,
      async (references, scopeQuery) => {
        const statement = imageSurfaceMutationPreimage(references, 'createProfileLink:setImage')
        statement.append(sql`, updated AS (
          UPDATE user_profile_links link SET image_id = ${input.image_id}
          FROM surface_preimage before
          WHERE link.id = ${row.id} AND before.ordinality = 1
            AND link.image_id IS NOT DISTINCT FROM before.current_image_id
          RETURNING WITH (OLD AS prior, NEW AS current)
            link.id, link.user_id, link.link_type, link.sort_order, link.url_id, link.handle,
            link.name, link.image_id, link.created_at, link.updated_at,
            before.ordinality::int AS ordinality,
            prior.image_id AS previous_image_id, current.image_id AS current_image_id,
            before.placement_id AS previous_placement_id,
            before.placement_revision AS previous_placement_revision,
            before.activation_revision AS previous_activation_revision
        ) SELECT * FROM updated`)
        const { rows: changedRows } = await scopeQuery<
          Omit<ProfileLink, 'url' | 'image_placement'> & {
            ordinality: number
            previous_image_id: string | null
            current_image_id: string | null
            previous_placement_id: string | null
            previous_placement_revision: number | null
            previous_activation_revision: number | null
          }
        >(statement)
        assert(changedRows.length === 1, 409, 'Profile link image changed')
        const updatedLink = changedRows[0]!
        return {
          result: changedRows.map(projectStoredProfileLink),
          changes: [
            imageSurfaceMutationChange({
              ordinality: updatedLink.ordinality,
              previousImageId: updatedLink.previous_image_id,
              currentImageId: updatedLink.current_image_id,
              previousPlacementId: updatedLink.previous_placement_id,
              previousPlacementRevision: updatedLink.previous_placement_revision,
              previousActivationRevision: updatedLink.previous_activation_revision,
            }),
          ],
        }
      },
    )
    row = updated[0]!
  }
  await transaction.commit()
  void enqueueReconcileMediaDeliveryRegistry()
  // Registry projection is asynchronous. Do not advertise a placement route until listProfileLinks
  // can prove its allow record completed.
  return { ...row, url: input.url ?? null, image_placement: null }
}
export { updateProfileLink } from './profile-links-update.mts'

export async function deleteProfileLink(userId: string, linkId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await writeImageSurfaceMutation(
    transaction,
    [{ surfaceKind: 'user-profile-link-image', userProfileLinkId: linkId, nextImageId: null }],
    null,
    async (references, scopeQuery) => {
      const statement = imageSurfaceMutationPreimage(references, 'deleteProfileLink')
      statement.append(sql`, removed AS (
        DELETE FROM user_profile_links link
        USING surface_preimage before
        WHERE link.id = ${linkId} AND link.user_id = ${userId} AND before.ordinality = 1
          AND link.image_id IS NOT DISTINCT FROM before.current_image_id
        RETURNING WITH (OLD AS prior)
          before.ordinality::int AS ordinality, prior.image_id AS previous_image_id,
          NULL::uuid AS current_image_id, before.placement_id AS previous_placement_id,
          before.placement_revision AS previous_placement_revision,
          before.activation_revision AS previous_activation_revision
      ) SELECT * FROM removed`)
      const { rows } = await scopeQuery<{
        ordinality: number
        previous_image_id: string | null
        current_image_id: string | null
        previous_placement_id: string | null
        previous_placement_revision: number | null
        previous_activation_revision: number | null
      }>(statement)
      assert(rows.length === 1, 404, 'Profile link not found')
      return {
        result: undefined,
        changes: rows.map(row =>
          imageSurfaceMutationChange({
            ordinality: row.ordinality,
            previousImageId: row.previous_image_id,
            currentImageId: row.current_image_id,
            previousPlacementId: row.previous_placement_id,
            previousPlacementRevision: row.previous_placement_revision,
            previousActivationRevision: row.previous_activation_revision,
          }),
        ),
      }
    },
  )
  await transaction.commit()
  void enqueueReconcileMediaDeliveryRegistry()
}
