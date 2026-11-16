import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { publishImagePlacementDenialTuples } from '@services/media-delivery-safety/delivery-registry-publish'

/** A court filing and its current target-tuple denials become durable together. */
export async function denyCopyrightCourtFilingPlacements(
  noticeId: string,
  query: TransactionQuery,
): Promise<void> {
  const { rows } = await query<{
    placement_id: string
    revision: number
    image_id: string
  }>(sql`/* denyCopyrightCourtFilingPlacements:tuples */
    SELECT DISTINCT registry.placement_id, registry.placement_revision AS revision, registry.image_id
    FROM copyright_notice_targets target
    JOIN copyright_notice_target_images target_image ON target_image.copyright_notice_target_id = target.id
    JOIN media_delivery_registry_records registry ON registry.placement_id = target.placement_id
      AND registry.image_id = target_image.image_id
    WHERE target.copyright_notice_id = ${noticeId}
    ORDER BY registry.placement_id, registry.placement_revision, registry.image_id
  `)
  const { rows: current } = await query<{
    placement_id: string
    revision: number
    image_id: string
  }>(sql`
    /* denyCopyrightCourtFilingPlacements:current */
    SELECT DISTINCT placement.id AS placement_id, placement.revision, binding.image_id
    FROM copyright_notice_targets target
    JOIN copyright_notice_target_images image ON image.copyright_notice_target_id = target.id
    JOIN retained_image_placement_bindings binding ON binding.placement_id = target.placement_id
      AND binding.image_id = image.image_id
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE target.copyright_notice_id = ${noticeId}
    ORDER BY placement.id, placement.revision, binding.image_id
  `)
  // This atomic legal write cannot leave a suffix allowed. The existing protocol bounds each
  // provider request; total work scales with the notice's actual current target tuples.
  await publishImagePlacementDenialTuples(
    [...rows, ...current].map(row => ({
      placementId: row.placement_id,
      revision: row.revision,
      imageId: row.image_id,
    })),
    query,
  )
}
