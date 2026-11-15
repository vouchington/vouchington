import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getImagesWorkLimit } from './work-limits.mts'
/** Retire one inspected surface-binding page, including no-op rows in its cursor. */
export async function retireImageSurfacePlacementsForDeletedImage(
  imageId: string,
  query: QueryExecutor,
  afterPlacementId?: string,
): Promise<string[]> {
  const page = sql`/* retireImageSurfacePlacementsForDeletedImage */
    WITH page AS MATERIALIZED (
      SELECT placement_id FROM image_surface_placements WHERE image_id = ${imageId}`
  if (afterPlacementId) page.append(sql` AND placement_id > ${afterPlacementId}`)
  page.append(sql`
      ORDER BY placement_id LIMIT ${getImagesWorkLimit('deletion_page_size')}
    ), retired AS (
      UPDATE media_placements placement
      SET retired_at = CURRENT_TIMESTAMP,
          retirement_reason = 'asset_deleted',
          revision = placement.revision + 1
      WHERE placement.id = ANY(ARRAY(SELECT placement_id FROM page))
        AND placement.retired_at IS NULL
      RETURNING placement.id
    )
    SELECT placement_id FROM page ORDER BY placement_id
  `)
  const { rows } = await query<{ placement_id: string }>(page)
  return rows.map(row => row.placement_id)
}
