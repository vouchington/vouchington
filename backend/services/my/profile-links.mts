import { MAX_PROFILE_LINKS } from '@voucha/types/entities/user-constants'
import { beginTransaction, read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { addUrl } from '@services/urls/upsert'
import {
  assertImagesReadyForSurface,
  writeImageSurfaceMutation,
} from '@services/media-delivery-safety'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import {
  assertProfileLinkType,
  validateProfileLinkFields,
  validateProfileUrl,
  type CreateProfileLinkInput,
  type UpdateProfileLinkInput,
} from './profile-links-input.mts'
import type { ProfileLink } from './profile-links-types.mts'
export type { ProfileLink } from './profile-links-types.mts'

export { reorderProfileLinks } from './profile-links-reorder.mts'
export { listProfileLinks } from './profile-links-list.mts'
export type { ProfileLinkType } from './profile-links-input.mts'
export { MAX_PROFILE_LINKS } from '@voucha/types/entities/user-constants'
async function resolveUrlId(
  userId: string,
  url: string | null | undefined,
): Promise<string | null> {
  if (!url || typeof url !== 'string') return null
  const result = await addUrl(userId, url)
  return result?.id ?? null
}
export async function createProfileLink(
  userId: string,
  input: CreateProfileLinkInput,
): Promise<ProfileLink> {
  assertProfileLinkType(input.link_type)
  validateProfileLinkFields(input.link_type, input.url, input.handle)
  const urlId = await resolveUrlId(userId, input.url)
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
  let row = rows[0] as Omit<ProfileLink, 'url' | 'image_placement'>
  if (input.image_id) {
    const { rows: updated } = await writeImageSurfaceMutation(
      transaction,
      [
        {
          surfaceKind: 'user-profile-link-image',
          userProfileLinkId: row.id,
          nextImageId: input.image_id,
        },
      ],
      userId,
      (_before, scopeQuery) =>
        scopeQuery<Omit<ProfileLink, 'url' | 'image_placement'>>(
          sql`/* createProfileLink:setImage */
        UPDATE user_profile_links SET image_id = ${input.image_id}
        WHERE id = ${row.id}
        RETURNING id, user_id, link_type, sort_order, url_id, handle, name, image_id,
          created_at, updated_at
      `,
        ),
    )
    row = updated[0]!
  }
  await transaction.commit()
  void enqueueReconcileMediaDeliveryRegistry()
  // Registry projection is asynchronous. Do not advertise a placement route until listProfileLinks
  // can prove its allow record completed.
  return { ...row, url: input.url ?? null, image_placement: null }
}
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
  const urlId = input.url !== undefined ? await resolveUrlId(userId, input.url) : undefined
  // CASE WHEN preserves existing column values for fields not included in input
  await using transaction = await beginTransaction()
  const { rows: existingRows } = await transaction<{ image_id: string | null }>(sql`
    /* updateProfileLink:lockImageSurface */
    SELECT image_id FROM user_profile_links
    WHERE id = ${linkId} AND user_id = ${userId}
  `)
  const existing = existingRows[0]
  assert(existing, 404, 'Profile link not found')
  const desiredImageId = input.image_id === undefined ? existing.image_id : input.image_id
  const { rows } = await writeImageSurfaceMutation(
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
    (_before, scopeQuery) =>
      scopeQuery(sql`/* updateProfileLink */
    UPDATE user_profile_links
    SET
      url_id = CASE WHEN ${urlId !== undefined} THEN ${urlId ?? null} ELSE url_id END,
      handle = CASE WHEN ${input.handle !== undefined} THEN ${input.handle ?? null} ELSE handle END,
      name = CASE WHEN ${input.name !== undefined} THEN ${input.name ?? null} ELSE name END,
      image_id = CASE WHEN ${input.image_id !== undefined} THEN ${input.image_id ?? null} ELSE image_id END
    WHERE id = ${linkId} AND user_id = ${userId}
      AND image_id IS NOT DISTINCT FROM ${existing.image_id}::uuid
    RETURNING id, user_id, link_type, sort_order, url_id, handle, name, image_id, created_at, updated_at
  `),
  )
  assert(rows.length > 0, 404, 'Profile link not found')
  const row = rows[0] as Omit<ProfileLink, 'url' | 'image_placement'>
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
export async function deleteProfileLink(userId: string, linkId: string): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction(
    sql`/* deleteProfileLink */ SELECT id FROM user_profile_links
      WHERE id = ${linkId} AND user_id = ${userId}`,
  )
  assert(rows.length === 1, 404, 'Profile link not found')
  await writeImageSurfaceMutation(
    transaction,
    [{ surfaceKind: 'user-profile-link-image', userProfileLinkId: linkId, nextImageId: null }],
    null,
    (before, scopeQuery) =>
      scopeQuery(sql`/* deleteProfileLink */ DELETE FROM user_profile_links
      WHERE id = ${linkId} AND user_id = ${userId}
        AND image_id IS NOT DISTINCT FROM ${before[0]!.current_image_id}::uuid`),
  )
  await transaction.commit()
  void enqueueReconcileMediaDeliveryRegistry()
}
