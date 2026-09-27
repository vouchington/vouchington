import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  lockImageAssetAdmission,
  syncImageSurfacePlacement,
} from '../../services/media-delivery-safety/index.mts'

export async function setTestTopicSurfaceImages(
  topicId: string,
  input: { logoImageId?: string | null; heroImageId?: string | null },
): Promise<void> {
  await using query = await beginTransaction()
  const logoImageId = input.logoImageId === undefined ? null : input.logoImageId
  const heroImageId = input.heroImageId === undefined ? null : input.heroImageId
  const imageIds = [input.logoImageId, input.heroImageId].flatMap(id => (id ? [id] : []))
  await lockImageAssetAdmission(imageIds, query)
  if (input.logoImageId !== undefined)
    await syncImageSurfacePlacement(
      { surfaceKind: 'topic-logo-image', topicId },
      input.logoImageId,
      query,
    )
  if (input.heroImageId !== undefined)
    await syncImageSurfacePlacement(
      { surfaceKind: 'topic-hero-image', topicId },
      input.heroImageId,
      query,
    )
  await query(sql`/* setTestTopicSurfaceImages */
    UPDATE topics SET
      logo_image_id = CASE WHEN ${input.logoImageId !== undefined}
        THEN ${logoImageId}::uuid ELSE logo_image_id END,
      hero_image_id = CASE WHEN ${input.heroImageId !== undefined}
        THEN ${heroImageId}::uuid ELSE hero_image_id END
    WHERE id = ${topicId}
  `)
  await query.commit()
}

export async function setTestCommunitySurfaceImages(
  communityId: string,
  input: { profileImageId?: string | null; bannerImageId?: string | null; deleted?: boolean },
): Promise<void> {
  if (
    input.deleted &&
    [input.profileImageId, input.bannerImageId].some(id => id !== null && id !== undefined)
  )
    throw new Error('Deleted community fixture cannot add a public image')
  await using query = await beginTransaction()
  const profileImageId = input.profileImageId === undefined ? null : input.profileImageId
  const bannerImageId = input.bannerImageId === undefined ? null : input.bannerImageId
  const imageIds = [input.profileImageId, input.bannerImageId].flatMap(id => (id ? [id] : []))
  await lockImageAssetAdmission(imageIds, query)
  if (input.profileImageId !== undefined || input.deleted)
    await syncImageSurfacePlacement(
      { surfaceKind: 'community-profile-image', communityId },
      input.deleted ? null : profileImageId,
      query,
    )
  if (input.bannerImageId !== undefined || input.deleted)
    await syncImageSurfacePlacement(
      { surfaceKind: 'community-banner-image', communityId },
      input.deleted ? null : bannerImageId,
      query,
    )
  await query(sql`/* setTestCommunitySurfaceImages */
    UPDATE communities
    SET profile_image_id = CASE WHEN ${input.profileImageId !== undefined}
          THEN ${profileImageId}::uuid ELSE profile_image_id END,
        banner_image_id = CASE WHEN ${input.bannerImageId !== undefined}
          THEN ${bannerImageId}::uuid ELSE banner_image_id END,
        deleted_at = CASE WHEN ${input.deleted === true} THEN CURRENT_TIMESTAMP ELSE deleted_at END
    WHERE id = ${communityId}
  `)
  await query.commit()
}

export async function setTestUserProfileImage(
  userId: string,
  imageId: string | null,
): Promise<void> {
  await using query = await beginTransaction()
  await syncImageSurfacePlacement({ surfaceKind: 'user-profile-image', userId }, imageId, query)
  await query(sql`/* setTestUserProfileImage */
    UPDATE users SET profile_image_id = ${imageId} WHERE id = ${userId}
  `)
  await query.commit()
}
