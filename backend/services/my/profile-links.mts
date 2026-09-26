import { beginTransaction, read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { addUrl } from '@services/urls/upsert'
import { assertUrlNotBlocked } from '@services/domain-blacklist-check'
import {
  syncImageSurfacePlacement,
  type ImagePlacementTuple,
} from '@services/images/surface-placements'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { runSequentially } from '@modules/utils/run-sequentially'
import {
  lockImageAssetAdmission,
  lockImageSurfaceOwner,
  prepareImageSurfaceAdmission,
} from '@services/media-delivery-safety'
import {
  assertProfileLinkType,
  validateProfileLinkFields,
  validateProfileUrl,
  type CreateProfileLinkInput,
  type ProfileLinkType,
  type UpdateProfileLinkInput,
} from './profile-links-input.mts'
export { reorderProfileLinks } from './profile-links-reorder.mts'
export { listProfileLinks } from './profile-links-list.mts'
export type { ProfileLinkType } from './profile-links-input.mts'
export type ProfileLink = {
  id: string
  user_id: string
  link_type: ProfileLinkType
  sort_order: number
  url_id: string | null
  url: string | null
  handle: string | null
  name: string | null
  image_id: string | null
  image_placement?: ImagePlacementTuple | null
  created_at: Date
  updated_at: Date
}
const MAX_PROFILE_LINKS = 20
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
  if (input.url) await assertUrlNotBlocked(input.url)
  const urlId = await resolveUrlId(userId, input.url)
  // Atomic INSERT: compute next sort_order and enforce per-user limit in one query.
  // HAVING COUNT(*) < MAX_PROFILE_LINKS prevents insert when at the limit.
  await using transaction = await beginTransaction()
  const imageIds = input.image_id ? [input.image_id] : []
  await prepareImageSurfaceAdmission(imageIds, transaction)
  const { rows } = await transaction(sql`/* createProfileLink */
    INSERT INTO user_profile_links (user_id, link_type, sort_order, url_id, handle, name, image_id)
    SELECT
      ${userId}::uuid,
      ${input.link_type}::user_profile_link_types,
      COALESCE(MAX(sort_order), -1) + 1,
      ${urlId},
      ${input.handle ?? null},
      ${input.name ?? null},
      ${input.image_id ?? null}
    FROM user_profile_links
    WHERE user_id = ${userId}
    HAVING COUNT(*) < ${MAX_PROFILE_LINKS}
    RETURNING id, user_id, link_type, sort_order, url_id, handle, name, image_id, created_at, updated_at
  `)
  assert(rows.length > 0, 400, `Maximum of ${MAX_PROFILE_LINKS} profile links allowed`)
  const row = rows[0] as Omit<ProfileLink, 'url' | 'image_placement'>
  await syncImageSurfacePlacement(
    { surfaceKind: 'user-profile-link-image', userProfileLinkId: row.id },
    row.image_id,
    transaction,
  )
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
    await assertUrlNotBlocked(input.url)
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
  await lockImageAssetAdmission(input.image_id ? [input.image_id] : [], transaction)
  await lockImageSurfaceOwner(
    { surfaceKind: 'user-profile-link-image', userProfileLinkId: linkId },
    transaction,
  )
  const { rows: existingRows } = await transaction<{ image_id: string | null }>(sql`
    /* updateProfileLink:lockImageSurface */
    SELECT image_id FROM user_profile_links
    WHERE id = ${linkId} AND user_id = ${userId}
    FOR UPDATE
  `)
  const existing = existingRows[0]
  assert(existing, 404, 'Profile link not found')
  const desiredImageId = input.image_id === undefined ? existing.image_id : input.image_id
  if (input.image_id !== undefined)
    await syncImageSurfacePlacement(
      { surfaceKind: 'user-profile-link-image', userProfileLinkId: linkId },
      desiredImageId ?? null,
      transaction,
    )
  const { rows } = await transaction(sql`/* updateProfileLink */
    UPDATE user_profile_links
    SET
      url_id = CASE WHEN ${urlId !== undefined} THEN ${urlId ?? null} ELSE url_id END,
      handle = CASE WHEN ${input.handle !== undefined} THEN ${input.handle ?? null} ELSE handle END,
      name = CASE WHEN ${input.name !== undefined} THEN ${input.name ?? null} ELSE name END,
      image_id = CASE WHEN ${input.image_id !== undefined} THEN ${input.image_id ?? null} ELSE image_id END
    WHERE id = ${linkId} AND user_id = ${userId}
    RETURNING id, user_id, link_type, sort_order, url_id, handle, name, image_id, created_at, updated_at
  `)
  assert(rows.length > 0, 404, 'Profile link not found')
  const row = rows[0] as Omit<ProfileLink, 'url' | 'image_placement'>
  await transaction.commit()
  void enqueueReconcileMediaDeliveryRegistry()
  // For partial updates without url field, fetch the existing url from database
  if (input.url === undefined) {
    const { rows: urlRows } = await read(sql`/* updateProfileLink */
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
  await lockImageSurfaceOwner(
    { surfaceKind: 'user-profile-link-image', userProfileLinkId: linkId },
    transaction,
  )
  const { rows } = await transaction(
    sql`/* deleteProfileLink */ SELECT id FROM user_profile_links
      WHERE id = ${linkId} AND user_id = ${userId} FOR UPDATE`,
  )
  assert(rows.length === 1, 404, 'Profile link not found')
  await runSequentially([
    () =>
      syncImageSurfacePlacement(
        { surfaceKind: 'user-profile-link-image', userProfileLinkId: linkId },
        null,
        transaction,
      ),
    () =>
      transaction(sql`/* deleteProfileLink */
        UPDATE image_surface_placements
        SET user_profile_link_id = NULL, retired_user_profile_link_id = ${linkId}
        WHERE surface_kind = 'user-profile-link-image' AND user_profile_link_id = ${linkId}
      `),
    () =>
      transaction(sql`/* deleteProfileLink */ DELETE FROM user_profile_links WHERE id = ${linkId}`),
  ])
  await transaction.commit()
  void enqueueReconcileMediaDeliveryRegistry()
}
