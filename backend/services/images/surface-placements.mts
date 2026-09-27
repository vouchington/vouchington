import type { QueryExecutor } from '@data-stores/psql/types'
import type { ImagePlacementRetirement } from './placements.mts'
import sql from 'sql-template-strings'
export async function retireImageSurfacePlacementsForDeletedImage(
  imageId: string,
  query: QueryExecutor,
): Promise<ImagePlacementRetirement[]> {
  const { rows } = await query<{ placement_id: string; revision: number }>(
    sql`/* retireImageSurfacePlacementsForDeletedImage */
      UPDATE media_placements placement
      SET retired_at = CURRENT_TIMESTAMP,
          retirement_reason = 'asset_deleted',
          revision = placement.revision + 1
      FROM image_surface_placements surface
      WHERE surface.placement_id = placement.id
        AND surface.image_id = ${imageId}
        AND placement.retired_at IS NULL
      RETURNING placement.id AS placement_id, placement.revision
    `,
  )
  return rows.map(row => ({ placementId: row.placement_id, revision: row.revision }))
}
