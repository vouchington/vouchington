import type { QueryExecutor } from '@data-stores/psql/types'
import { IMAGE_PLACEMENT_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import sql from 'sql-template-strings'
import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'

/**
 * Call under the image asset admission locks, before activating new or retired bindings.
 * One input occurrence is one proposed live activation; repeats reserve multiple slots.
 * The image deletion denial publishes exactly these live post and surface placements.
 */
export async function assertImagePlacementCapacity(
  imageIds: readonly string[],
  query: QueryExecutor,
): Promise<void> {
  if (imageIds.length === 0) return
  const cap = getMediaDeliverySafetyWorkLimit('max_placements_per_image')
  const { rows } = await query<{ image_id: string; live_count: number; additions: number }>(sql`
    /* assertImagePlacementCapacity */
    WITH requested AS (
      SELECT image_id, count(*)::integer AS additions
      FROM unnest(${imageIds}::uuid[]) AS input(image_id)
      GROUP BY image_id
    )
    SELECT requested.image_id, requested.additions, counted.live_count::integer
    FROM requested
    CROSS JOIN LATERAL (
      SELECT count(*) AS live_count
      FROM (
        SELECT placement_id
        FROM (
          SELECT binding.placement_id
          FROM (
            SELECT placement_id FROM image_placements
            WHERE image_id = requested.image_id
            ORDER BY placement_id
          ) binding
          JOIN LATERAL (
            SELECT retired_at FROM media_placements
            WHERE id = binding.placement_id
            LIMIT 1
          ) placement ON placement.retired_at IS NULL
          UNION ALL
          SELECT surface.placement_id
          FROM (
            SELECT placement_id FROM image_surface_placements
            WHERE image_id = requested.image_id
            ORDER BY placement_id
          ) surface
          JOIN LATERAL (
            SELECT retired_at FROM media_placements
            WHERE id = surface.placement_id
            LIMIT 1
          ) placement ON placement.retired_at IS NULL
        ) live_placements
        LIMIT ${cap}
      ) bounded_placements
    ) counted
    ORDER BY requested.image_id
  `)
  if (rows.some(row => row.live_count + row.additions > cap)) {
    throw createCodedError(409, 'Image placement limit reached', IMAGE_PLACEMENT_LIMIT_REACHED)
  }
}
