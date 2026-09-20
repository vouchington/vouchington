import type { QueryExecutor } from '@data-stores/psql/types'
import {
  invalidateMediaDeliveryPath,
  isMediaDeliveryRegistryPublicationEnabled,
  putMediaDeliveryRegistryRecord,
} from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'

export type ImageSurfaceReference =
  | { surfaceKind: 'user-profile-image'; userId: string }
  | { surfaceKind: 'topic-logo-image' | 'topic-hero-image'; topicId: string }
  | { surfaceKind: 'community-profile-image' | 'community-banner-image'; communityId: string }
  | { surfaceKind: 'user-profile-link-image'; userProfileLinkId: string }

/**
 * Publishes the current exact route as denied before its owner row can stop identifying it.
 * A provider failure rejects the caller's transaction, while a later DB failure leaves the
 * externally visible route safely denied.
 */
export async function prepublishImageSurfaceDenial(
  reference: ImageSurfaceReference,
  query: QueryExecutor,
): Promise<void> {
  const statement = sql`/* prepublishImageSurfaceDenial:current */
    SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id
    FROM image_surface_placements surface
    JOIN media_placements placement ON placement.id = surface.placement_id
    WHERE `
  statement.append(surfaceWhere(reference))
  statement.append(sql` AND placement.retired_at IS NULL
    ORDER BY placement.id DESC LIMIT 1 FOR UPDATE OF placement`)
  const { rows } = await query<{
    placement_id: string
    placement_revision: number
    image_id: string
  }>(statement)
  const current = rows[0]
  if (!current) return
  const deliveryKey = `image-placement:${current.placement_id}:${current.placement_revision}:${current.image_id}`
  const { rows: stagedRows } = await query<{ generation: number }>(sql`
    /* prepublishImageSurfaceDenial:stage */
    INSERT INTO media_delivery_registry_records (
      delivery_key, media_kind, route_kind, placement_id, placement_revision, asset_id,
      desired_state
    ) VALUES (
      ${deliveryKey}, 'image', 'placement', ${current.placement_id},
      ${current.placement_revision}, ${current.image_id}, 'withheld'
    )
    ON CONFLICT (delivery_key) DO UPDATE
    SET desired_state = 'withheld', state = 'pending', claimed_at = NULL,
      completed_at = NULL, generation = media_delivery_registry_records.generation + 1
    RETURNING generation
  `)
  const generation = stagedRows[0]?.generation
  if (generation === undefined) throw new Error('Failed to stage the prior image surface denial')
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  await putMediaDeliveryRegistryRecord({ deliveryKey, state: 'withheld', generation })
  await invalidateMediaDeliveryPath(
    `/images/placements/${current.placement_id}/${current.placement_revision}/${current.image_id}`,
  )
  const { rowCount } = await query(sql`/* prepublishImageSurfaceDenial:complete */
    UPDATE media_delivery_registry_records
    SET state = 'completed', projected_at = CURRENT_TIMESTAMP,
      invalidated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP,
      next_attempt_at = NULL, failure_message = NULL
    WHERE delivery_key = ${deliveryKey} AND desired_state = 'withheld'
      AND generation = ${generation}
  `)
  if (rowCount !== 1)
    throw new Error(`Media delivery generation changed while denying ${deliveryKey}`)
}

function surfaceWhere(reference: ImageSurfaceReference): ReturnType<typeof sql> {
  if ('userId' in reference)
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.user_id = ${reference.userId}`
  if ('topicId' in reference)
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.topic_id = ${reference.topicId}`
  if ('communityId' in reference)
    return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.community_id = ${reference.communityId}`
  return sql`surface.surface_kind = ${reference.surfaceKind} AND surface.user_profile_link_id = ${reference.userProfileLinkId}`
}
