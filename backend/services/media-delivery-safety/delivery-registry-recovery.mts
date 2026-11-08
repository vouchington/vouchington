import { write } from '@data-stores/psql'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { reconcileDeliveryRepairMarkers } from './delivery-repair-markers.mts'
import { processMediaDeliveryRegistryRecord } from './delivery-registry-process.mts'
import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'

/** Immediate rollback recovery consumes the same durable wakeups as the bounded worker. */
export async function repairFailedImageDeliveryMutation(input: {
  postIds?: string[]
  imageIds?: string[]
}): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  // The explicit placement-key restriction keeps the registry join from scanning unrelated rows.
  const { rows } = await write<{
    media_delivery_registry_record_id: string
    marker_token: string
  }>(sql`
    /* repairFailedImageDeliveryMutation */
    WITH bindings AS MATERIALIZED (
      SELECT placement_id, image_id FROM image_placements
      WHERE post_id = ANY(${input.postIds ?? []}::uuid[])
      UNION
      SELECT placement_id, image_id FROM image_placements
      WHERE image_id = ANY(${input.imageIds ?? []}::uuid[])
      UNION
      SELECT placement_id, image_id FROM image_surface_placements
      WHERE image_id = ANY(${input.imageIds ?? []}::uuid[])
    )
    SELECT DISTINCT marker.media_delivery_registry_record_id, marker.marker_token
    FROM media_delivery_repair_markers marker
    JOIN media_delivery_registry_records registry ON registry.id = marker.media_delivery_registry_record_id
    JOIN bindings binding ON registry.placement_id = binding.placement_id
      AND registry.image_id = binding.image_id
      AND registry.placement_id = ANY(ARRAY(SELECT placement_id FROM bindings))
    ORDER BY marker.media_delivery_registry_record_id
    LIMIT ${getMediaDeliverySafetyWorkLimit('recovery_page_size')}
  `)
  // Markers beyond the page stay durable; the bounded repair worker consumes them.
  await reconcileDeliveryRepairMarkers(rows)
  for (const marker of rows) {
    // oxlint-disable-next-line no-await-in-loop -- projection follows committed exact-authority repair.
    await processMediaDeliveryRegistryRecord(marker.media_delivery_registry_record_id)
  }
}
