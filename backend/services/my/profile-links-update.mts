import { beginTransaction, read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { writeImageSurfaceMutation } from '@services/media-delivery-safety'
import {
  imageSurfaceMutationChange,
  imageSurfaceMutationPreimage,
} from '@services/media-delivery-safety/surface-mutation-bindings'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { validateProfileUrl, type UpdateProfileLinkInput } from './profile-links-input.mts'
import type { ProfileLink } from './profile-links-types.mts'
import { resolveProfileLinkUrlId } from './profile-links-url.mts'
import { projectStoredProfileLink, type StoredProfileLink } from './profile-links-projection.mts'

export async function updateProfileLink(
  userId: string,
  linkId: string,
  input: UpdateProfileLinkInput,
): Promise<ProfileLink> {
  if (typeof input.url === 'string' && input.url.length > 0) {
    validateProfileUrl(input.url)
  }
  if (typeof input.handle === 'string' && input.handle.length > 0) {
    assert(
      /^[a-zA-Z0-9_-]+$/.test(input.handle),
      400,
      'handle must only contain letters, numbers, underscores, and hyphens',
    )
  }
  const urlId =
    input.url !== undefined ? await resolveProfileLinkUrlId(userId, input.url) : undefined
  // CASE WHEN preserves existing column values for fields not included in input
  await using transaction = await beginTransaction()
  let existing: { image_id: string | null } | undefined
  if (input.image_id === undefined) {
    const { rows } = await transaction<{ image_id: string | null }>(sql`
      /* updateProfileLink:lockImageSurface */
      SELECT image_id FROM user_profile_links
      WHERE id = ${linkId} AND user_id = ${userId}
    `)
    existing = rows[0]
    assert(existing, 404, 'Profile link not found')
  }
  const desiredImageId =
    input.image_id === undefined ? (existing?.image_id ?? null) : input.image_id
  const rows = await writeImageSurfaceMutation(
    transaction,
    input.image_id === undefined
      ? []
      : [
          {
            surfaceKind: 'user-profile-link-image',
            userProfileLinkId: linkId,
            nextImageId: desiredImageId ?? null,
          },
        ],
    userId,
    async (references, scopeQuery) => {
      const statement = references.length
        ? imageSurfaceMutationPreimage(references, 'updateProfileLink')
        : sql`/* updateProfileLink */`
      if (references.length) statement.append(sql`, updated AS (`)
      else statement.append(sql`WITH updated AS (`)
      statement.append(sql`UPDATE user_profile_links link SET
      url_id = CASE WHEN ${urlId !== undefined} THEN ${urlId ?? null} ELSE link.url_id END,
      handle = CASE WHEN ${input.handle !== undefined} THEN ${input.handle ?? null} ELSE link.handle END,
      name = CASE WHEN ${input.name !== undefined} THEN ${input.name ?? null} ELSE link.name END,
      image_id = CASE WHEN ${input.image_id !== undefined} THEN ${input.image_id ?? null} ELSE link.image_id END`)
      if (references.length) statement.append(sql` FROM surface_preimage before`)
      statement.append(sql` WHERE link.id = ${linkId} AND link.user_id = ${userId}`)
      if (references.length)
        statement.append(sql` AND before.ordinality = 1
          AND link.image_id IS NOT DISTINCT FROM before.current_image_id`)
      else
        statement.append(sql` AND link.image_id IS NOT DISTINCT FROM ${existing!.image_id}::uuid`)
      statement.append(sql` RETURNING WITH (OLD AS prior, NEW AS current)
        link.id, link.user_id, link.link_type, link.sort_order, link.url_id, link.handle,
        link.name, link.image_id, link.created_at, link.updated_at`)
      if (references.length)
        statement.append(sql`, before.ordinality::int AS ordinality,
          prior.image_id AS previous_image_id, current.image_id AS current_image_id,
          before.placement_id AS previous_placement_id,
          before.placement_revision AS previous_placement_revision,
          before.activation_revision AS previous_activation_revision`)
      statement.append(sql`) SELECT * FROM updated`)
      const { rows: changedRows } = await scopeQuery(statement)
      assert(changedRows.length > 0, 404, 'Profile link not found')
      const result = changedRows as (Omit<ProfileLink, 'url' | 'image_placement'> & {
        ordinality?: number
        previous_image_id?: string | null
        current_image_id?: string | null
        previous_placement_id?: string | null
        previous_placement_revision?: number | null
        previous_activation_revision?: number | null
      })[]
      return {
        result: result.map(projectStoredProfileLink),
        changes: references.length
          ? [
              imageSurfaceMutationChange({
                ordinality: result[0]!.ordinality!,
                previousImageId: result[0]!.previous_image_id ?? null,
                currentImageId: result[0]!.current_image_id ?? null,
                previousPlacementId: result[0]!.previous_placement_id ?? null,
                previousPlacementRevision: result[0]!.previous_placement_revision ?? null,
                previousActivationRevision: result[0]!.previous_activation_revision ?? null,
              }),
            ]
          : [],
      }
    },
  )
  const row = projectStoredProfileLink(rows[0] as StoredProfileLink)
  await transaction.commit()
  void enqueueReconcileMediaDeliveryRegistry()
  // For partial updates without url field, fetch the existing url from database
  if (input.url === undefined) {
    const { rows: urlRows } = await read<{ url: string }>(sql`/* updateProfileLink */
      SELECT u.url
      FROM urls u
      WHERE u.id = ${row.url_id}
    `)
    const existingUrl = urlRows[0]?.url ?? null
    return { ...row, url: existingUrl, image_placement: null }
  }
  return { ...row, url: input.url ?? null, image_placement: null }
}
