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
  user_id: string | null
  user_profile_link_id: string | null
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
      placement.retired_at, placement.retirement_reason, surface.user_id,
      surface.user_profile_link_id
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

/** Makes one current user profile-image surface visible through the fail-closed delivery registry. */
export async function allowTestUserProfileImageDelivery(input: {
  userId: string
  imageId: string
}): Promise<void> {
  const placements = await getTestImageSurfacePlacements({
    userId: input.userId,
    imageId: input.imageId,
    surfaceKind: 'user-profile-image',
  })
  const placement = placements.find(candidate => candidate.retired_at === null)
  if (!placement) {
    throw new Error(
      `Expected an active user-profile-image placement for ${input.userId}/${input.imageId}`,
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

export async function setTestImageCreator(imageId: string, userId: string): Promise<void> {
  await write(sql`/* setTestImageCreator */
    UPDATE images SET created_by_id = ${userId} WHERE id = ${imageId}
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
