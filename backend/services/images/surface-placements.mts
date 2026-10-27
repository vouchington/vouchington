import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
export async function retireImageSurfacePlacementsForDeletedImage(
  imageId: string,
  query: QueryExecutor,
): Promise<void> {
  await query(
    sql`/* retireImageSurfacePlacementsForDeletedImage */
      UPDATE media_placements placement
      SET retired_at = CURRENT_TIMESTAMP,
          retirement_reason = 'asset_deleted',
          revision = placement.revision + 1
      FROM image_surface_placements surface
      WHERE surface.placement_id = placement.id
        AND surface.image_id = ${imageId}
        AND placement.retired_at IS NULL
    `,
  )
}
