import { write } from '@data-stores/psql'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { reconcileDeliveryRepairMarkers } from './delivery-repair-markers.mts'
import { processMediaDeliveryRegistryRecord } from './delivery-registry-process.mts'
import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'

/** Immediate rollback recovery consumes the same durable wakeups as the bounded worker. */
export async function repairFailedImageDeliveryMutation(
  input: { postIds?: string[]; imageIds?: string[] },
  recordIds?: readonly string[],
): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled() || recordIds?.length === 0) return
  if (!input.postIds?.length && !input.imageIds?.length) return
  const rows = await listFailedImageDeliveryRepairMarkers(input, recordIds)
  // Markers beyond the page stay durable; the bounded repair worker consumes them.
  await reconcileDeliveryRepairMarkers(rows)
  for (const marker of rows) {
    // oxlint-disable-next-line no-await-in-loop -- projection follows committed exact-authority repair.
    await processMediaDeliveryRegistryRecord(marker.media_delivery_registry_record_id)
  }
}

/** Selects bounded durable repair work without publishing or consuming its tokens. */
export async function listFailedImageDeliveryRepairMarkers(
  input: { postIds?: string[]; imageIds?: string[] },
  recordIds?: readonly string[],
): Promise<{ media_delivery_registry_record_id: string; marker_token: string }[]> {
  if (recordIds?.length === 0 || (!input.postIds?.length && !input.imageIds?.length)) return []
  // Walk durable work first: retained bindings can grow without bound for one image.
  // The existing reconciler drains this same oldest-first index, so deferred markers
  // advance naturally as earlier tokens are consumed.
  const { rows: inspected } = await write<{
    media_delivery_registry_record_id: string
    marker_token: string
  }>(sql`
    /* repairFailedImageDeliveryMutation:markers */
    SELECT media_delivery_registry_record_id, marker_token
    FROM media_delivery_repair_markers
    WHERE (${recordIds ?? null}::uuid[] IS NULL
      OR media_delivery_registry_record_id = ANY(${recordIds ?? null}::uuid[]))
    ORDER BY created_at, media_delivery_registry_record_id
    LIMIT ${getMediaDeliverySafetyWorkLimit('recovery_page_size')}
  `)
  if (inspected.length === 0) return []
  const statement = sql`
    /* repairFailedImageDeliveryMutation */
    SELECT registry.id AS media_delivery_registry_record_id
    FROM media_delivery_registry_records registry`
  statement.append(
    sql` WHERE registry.id = ANY(${inspected.map(marker => marker.media_delivery_registry_record_id)}::uuid[]) AND `,
  )
  // A scalar lookup on the unique placement key keeps each ownership probe to one row.
  // JOIN and EXISTS plans scan/hash all retained bindings for the requested post.
  if (input.postIds?.length)
    statement.append(sql`(registry.image_id = ANY(${input.imageIds ?? []}::uuid[])
      OR (SELECT binding.post_id FROM image_placements binding
        WHERE binding.placement_id = registry.placement_id) = ANY(${input.postIds}::uuid[]))`)
  else statement.append(sql`registry.image_id = ANY(${input.imageIds ?? []}::uuid[])`)
  const { rows: owned } = await write<{ media_delivery_registry_record_id: string }>(statement)
  const ownedIds = new Set(owned.map(record => record.media_delivery_registry_record_id))
  return inspected.filter(marker => ownedIds.has(marker.media_delivery_registry_record_id))
}
