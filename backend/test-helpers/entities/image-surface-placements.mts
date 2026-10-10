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

export async function getTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId: string): Promise<{
  desired_state: 'allow' | 'withheld'
  state: 'pending' | 'claimed' | 'completed' | 'failed'
} | null> {
  const { rows } = await read<{
    desired_state: 'allow' | 'withheld'
    state: 'pending' | 'claimed' | 'completed' | 'failed'
  }>(sql`/* getTestMediaDeliveryRecord */
    SELECT desired_state, state
    FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId}
  `)
  return rows[0] ?? null
}

export async function completeTestMediaDeliveryRecord(
  mediaDeliveryRegistryRecordId: string,
): Promise<void> {
  await write(sql`/* completeTestMediaDeliveryRecord */
    INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, completed_at)
    SELECT media_delivery_registry_record_id, generation, 'completed', CURRENT_TIMESTAMP FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId} AND desired_state = 'allow'
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
  const { mediaDeliveryRegistryRecordId } = await stageImagePlacementDeliveryRecord({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: placement.image_id,
    state: 'allow',
  })
  await completeTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
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
  const { mediaDeliveryRegistryRecordId } = await stageImagePlacementDeliveryRecord({
    placementId: placement.placement_id,
    revision: placement.placement_revision,
    imageId: placement.image_id,
    state: 'allow',
  })
  await completeTestMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
}

export async function markTestMediaDeliveryRecordFailed(
  mediaDeliveryRegistryRecordId: string,
): Promise<void> {
  await write(sql`/* markTestMediaDeliveryRecordFailed */
    INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, delivery_attempt_count, completed_at, failure_message)
    SELECT media_delivery_registry_record_id, generation, 'failed', 5, CURRENT_TIMESTAMP, 'test provider outage' FROM view_media_delivery_registry_current_records
    WHERE media_delivery_registry_record_id = ${mediaDeliveryRegistryRecordId}
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
    SELECT EXISTS (
      SELECT 1 FROM view_publicly_projected_image_placements delivery
      WHERE delivery.placement_id = ${input.placementId}::uuid
        AND delivery.placement_revision = ${input.revision}
        AND delivery.image_id = ${input.imageId}::uuid
    ) AS projected
  `)
  return rows[0]?.projected ?? false
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

export async function getTestMediaDeliveryRegistryRecordId(input: {
  placementId: string
  revision: number
  imageId: string
}): Promise<string | null> {
  const { rows } = await read<{ id: string }>(sql`/* getTestMediaDeliveryRegistryRecordId */
    SELECT id FROM media_delivery_registry_records
    WHERE placement_id = ${input.placementId}::uuid AND placement_revision = ${input.revision}
      AND image_id = ${input.imageId}::uuid
  `)
  return rows[0]?.id ?? null
}
