import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Resolves the copyright ground while a separate deletion or safety ground retains denial. */
export async function clearUnavailableImagePlacementCopyrightWithholding(
  placementKey: string,
  options: QueryOptions = {},
): Promise<void> {
  const query = options.query ?? write
  await query(sql`/* clearUnavailableImagePlacementCopyrightWithholding */
    UPDATE media_placements placement
    SET copyright_withheld_at = NULL,
        revision = placement.revision + 1
    WHERE placement.placement_kind = 'image'
      AND ${placementKey} = concat('image-placement:', placement.id)
      AND placement.copyright_withheld_at IS NOT NULL
  `)
}
