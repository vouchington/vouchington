import { beginTransaction, read, write } from '@data-stores/psql'
import { restoreImagePlacementsAfterImageDeletion } from '../../services/images/placements.mts'
import { retireImageSurfacePlacementsForDeletedImage } from '../../services/images/surface-placements.mts'
import { stageImagePlacementDeliveryRecord } from '../../services/media-delivery-safety/delivery-registry-staging.mts'
import sql from 'sql-template-strings'

export type TestImageSurfacePlacement = {
  placement_id: string
  placement_revision: number
  image_id: string
  retired_at: Date | null
  retirement_reason: 'asset_deleted' | 'owner_removed' | null
  retired_user_id: string | null
  retired_user_profile_link_id: string | null
}

export async function getTestImageSurfacePlacements(input: {
  imageId?: string
  surfaceKind?: string
  userId?: string
  topicId?: string
  communityId?: string
  profileLinkId?: string
}): Promise<TestImageSurfacePlacement[]> {
  const { rows } = await read<TestImageSurfacePlacement>(sql`/* getTestImageSurfacePlacements */
    SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id,
      placement.retired_at, placement.retirement_reason, surface.retired_user_id,
      surface.retired_user_profile_link_id
    FROM image_surface_placements surface
    JOIN media_placements placement ON placement.id = surface.placement_id
    WHERE (${input.imageId ?? null}::uuid IS NULL OR surface.image_id = ${input.imageId ?? null}::uuid)
      AND (${input.surfaceKind ?? null}::text IS NULL OR surface.surface_kind = ${input.surfaceKind ?? null})
      AND (${input.userId ?? null}::uuid IS NULL OR surface.user_id = ${input.userId ?? null}::uuid)
      AND (${input.topicId ?? null}::uuid IS NULL OR surface.topic_id = ${input.topicId ?? null}::uuid)
      AND (${input.communityId ?? null}::uuid IS NULL OR surface.community_id = ${input.communityId ?? null}::uuid)
      AND (${input.profileLinkId ?? null}::uuid IS NULL OR surface.user_profile_link_id = ${input.profileLinkId ?? null}::uuid)
    ORDER BY surface.placement_id
  `)
  return rows
}

export async function getTestMediaDeliveryRecord(deliveryKey: string): Promise<{
  desired_state: 'allow' | 'withheld'
  state: 'pending' | 'claimed' | 'completed' | 'failed'
} | null> {
  const { rows } = await read<{
    desired_state: 'allow' | 'withheld'
    state: 'pending' | 'claimed' | 'completed' | 'failed'
  }>(sql`/* getTestMediaDeliveryRecord */
    SELECT desired_state, state
    FROM media_delivery_registry_records
    WHERE delivery_key = ${deliveryKey}
  `)
  return rows[0] ?? null
}

export async function completeTestMediaDeliveryRecord(deliveryKey: string): Promise<void> {
  await write(sql`/* completeTestMediaDeliveryRecord */
    UPDATE media_delivery_registry_records
    SET state = 'completed', completed_at = CURRENT_TIMESTAMP
    WHERE delivery_key = ${deliveryKey} AND desired_state = 'allow'
  `)
}

/** Makes one current topic-image surface visible through the fail-closed delivery registry. */
export async function allowTestTopicSurfaceImageDelivery(input: {
  topicId: string
  imageId: string
  surfaceKind: 'topic-logo-image' | 'topic-hero-image'
}): Promise<void> {
  const placements = await getTestImageSurfacePlacements({
    topicId: input.topicId,
    imageId: input.imageId,
    surfaceKind: input.surfaceKind,
  })
  const placement = placements.find(candidate => candidate.retired_at === null)
  if (!placement) {
    throw new Error(
      `Expected an active ${input.surfaceKind} placement for ${input.topicId}/${input.imageId}`,
    )
  }
  const { deliveryKey } = await stageImagePlacementDeliveryRecord({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: placement.image_id,
    state: 'allow',
  })
  await completeTestMediaDeliveryRecord(deliveryKey)
}

export async function markTestMediaDeliveryRecordFailed(deliveryKey: string): Promise<void> {
  await write(sql`/* markTestMediaDeliveryRecordFailed */
    UPDATE media_delivery_registry_records
    SET state = 'failed', delivery_attempt_count = 5, completed_at = CURRENT_TIMESTAMP,
      failure_message = 'test provider outage'
    WHERE delivery_key = ${deliveryKey}
  `)
}

export async function isTestImagePlacementPubliclyProjected(input: {
  placementId: string
  revision: number
  imageId: string
}): Promise<boolean> {
  const { rows } = await read<{
    projected: boolean
  }>(sql`/* isTestImagePlacementPubliclyProjected */
    SELECT fn_image_placement_publicly_projected(
      ${input.placementId}::uuid, ${input.revision}, ${input.imageId}::uuid
    ) AS projected
  `)
  return rows[0]?.projected ?? false
}

export async function setTestTopicSurfaceImages(
  topicId: string,
  input: { logoImageId?: string | null; heroImageId?: string | null },
): Promise<void> {
  const logoImageId = input.logoImageId === undefined ? null : input.logoImageId
  const heroImageId = input.heroImageId === undefined ? null : input.heroImageId
  await write(sql`/* setTestTopicSurfaceImages */
    UPDATE topics SET
      logo_image_id = CASE WHEN ${input.logoImageId !== undefined} THEN ${logoImageId}::uuid ELSE logo_image_id END,
      hero_image_id = CASE WHEN ${input.heroImageId !== undefined} THEN ${heroImageId}::uuid ELSE hero_image_id END
    WHERE id = ${topicId}
  `)
}

export async function setTestCommunitySurfaceImages(
  communityId: string,
  input: { profileImageId?: string | null; bannerImageId?: string | null; deleted?: boolean },
): Promise<void> {
  const profileImageId = input.profileImageId === undefined ? null : input.profileImageId
  const bannerImageId = input.bannerImageId === undefined ? null : input.bannerImageId
  await write(sql`/* setTestCommunitySurfaceImages */
    UPDATE communities
    SET profile_image_id = CASE WHEN ${input.profileImageId !== undefined} THEN ${profileImageId}::uuid ELSE profile_image_id END,
        banner_image_id = CASE WHEN ${input.bannerImageId !== undefined} THEN ${bannerImageId}::uuid ELSE banner_image_id END,
        deleted_at = CASE WHEN ${input.deleted === true} THEN CURRENT_TIMESTAMP ELSE deleted_at END
    WHERE id = ${communityId}
  `)
}

export async function setTestImageCreator(imageId: string, userId: string): Promise<void> {
  await write(sql`/* setTestImageCreator */
    UPDATE images SET created_by_id = ${userId} WHERE id = ${imageId}
  `)
}

export async function setTestUserProfileImage(userId: string, imageId: string): Promise<void> {
  await write(sql`/* setTestUserProfileImage */
    UPDATE users SET profile_image_id = ${imageId} WHERE id = ${userId}
  `)
}

export async function retireTestImageSurfacePlacementsForDeletedImage(
  imageId: string,
): Promise<Array<{ placementId: string; revision: number }>> {
  await using transaction = await beginTransaction()
  const retired = await retireImageSurfacePlacementsForDeletedImage(imageId, transaction)
  await transaction.commit()
  return retired
}

export async function restoreTestImageSurfacePlacementsAfterImageDeletion(
  retiredPlacements: Array<{ placementId: string; revision: number }>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await restoreImagePlacementsAfterImageDeletion(retiredPlacements, transaction)
  await transaction.commit()
}
