import { write } from '@data-stores/psql'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { reconcileDeliveryRepairMarker } from './delivery-repair-markers.mts'
import { processMediaDeliveryRegistryRecord } from './delivery-registry-process.mts'

/** Immediate rollback recovery consumes the same durable wakeups as the bounded worker. */
export async function repairFailedImageDeliveryMutation(input: {
  postIds?: string[]
  imageIds?: string[]
}): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  const { rows } = await write<{ delivery_key: string; marker_token: string }>(sql`
    /* repairFailedImageDeliveryMutation */
    SELECT DISTINCT marker.delivery_key, marker.marker_token
    FROM media_delivery_repair_markers marker
    JOIN media_delivery_registry_records registry USING (delivery_key)
    JOIN (
      SELECT placement_id, image_id, post_id FROM image_placements
      UNION ALL SELECT placement_id, image_id, NULL::uuid FROM image_surface_placements
    ) binding ON registry.placement_id = binding.placement_id
      AND registry.image_id = binding.image_id
    WHERE binding.post_id = ANY(${input.postIds ?? []}::uuid[])
      OR binding.image_id = ANY(${input.imageIds ?? []}::uuid[])
    ORDER BY marker.delivery_key
  `)
  for (const marker of rows) {
    // oxlint-disable-next-line no-await-in-loop -- one exact placement authority domain per repair.
    await reconcileDeliveryRepairMarker(marker)
    // oxlint-disable-next-line no-await-in-loop -- projection follows committed exact-authority repair.
    await processMediaDeliveryRegistryRecord(marker.delivery_key)
  }
}
