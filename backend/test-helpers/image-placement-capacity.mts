import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { mediaDeliverySafetyWorkMaxValues } from '../services/media-delivery-safety/work-limits.mts'

/** Active placements for one image, capped at the hard maximum plus one. */
export async function readTestActiveImagePlacementCount(imageId: string): Promise<number> {
  const cap = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
  const { rows } = await read<{ placement_id: string }>(sql`/* readTestActiveImagePlacementCount */
    SELECT binding.placement_id
    FROM retained_image_placement_bindings binding
    JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE binding.image_id = ${imageId}
      AND placement.retired_at IS NULL
    ORDER BY binding.placement_id
    LIMIT ${cap + 1}`)
  return rows.length
}
