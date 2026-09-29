import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Resolves the host post that must be invalidated after a placement availability transition. */
export async function getPostIdForImagePlacementCopyright(
  placementId: string,
  options: QueryOptions = {},
): Promise<string | null> {
  const query = options.query ?? read
  const { rows } = await query<{ post_id: string }>(sql`/* getPostIdForImagePlacementCopyright */
    SELECT image_placement.post_id
    FROM image_placements image_placement
    JOIN media_placements placement ON placement.id = image_placement.placement_id
    WHERE placement.id = ${placementId}
  `)
  return rows[0]?.post_id ?? null
}
