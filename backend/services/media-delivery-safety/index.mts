import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  imageSurfaceWhere,
  lockImageSurfacePlacements,
  type ImageSurfaceReference,
} from './surface-lock.mts'
import { publishImagePlacementDeliveryRecord } from './delivery-registry-publish.mts'

export * from './delivery-registry.mts'
export { lockImageDeliveryMutation } from './delivery-lock.mts'
export {
  lockImageSurfaceOwner,
  lockImageSurfacePlacements,
  imageSurfaceWhere,
  type ImageSurfaceReference,
} from './surface-lock.mts'

/** Denies the exact current tuple while retaining its stable owner serialization fence. */
export async function prepublishImageSurfaceDenial(
  reference: ImageSurfaceReference,
  query: QueryExecutor,
): Promise<void> {
  await prepublishImageSurfaceDenials([reference], query)
}

export async function prepublishImageSurfaceDenials(
  references: ImageSurfaceReference[],
  query: QueryExecutor,
): Promise<void> {
  // A multi-slot owner takes its entire placement domain before any provider transition.
  const ordered = references.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const tuples: { placement_id: string; placement_revision: number; image_id: string }[] = []
  await lockImageSurfacePlacements(ordered, query)
  for (const reference of ordered) {
    const statement = sql`/* prepublishImageSurfaceDenial:current */
    SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id
    FROM image_surface_placements surface
    JOIN media_placements placement ON placement.id = surface.placement_id
    WHERE `
    statement.append(imageSurfaceWhere(reference))
    statement.append(sql` AND placement.retired_at IS NULL ORDER BY placement.id DESC LIMIT 1`)
    // oxlint-disable-next-line no-await-in-loop -- discovers every tuple before locking any placement.
    const { rows } = await query<{
      placement_id: string
      placement_revision: number
      image_id: string
    }>(statement)
    if (rows[0]) tuples.push(rows[0])
  }
  for (const current of tuples) {
    // oxlint-disable-next-line no-await-in-loop -- every tuple denial precedes the owner mutation.
    await publishImagePlacementDeliveryRecord(
      {
        placementId: current.placement_id,
        revision: current.placement_revision,
        imageId: current.image_id,
        state: 'withheld',
      },
      { query },
    )
  }
}
