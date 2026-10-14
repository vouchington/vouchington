import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  imageSurfaceReferences,
  lockImageSurfacePlacements,
  type ImageSurfaceReference,
} from './surface-lock.mts'
import { prepublishImagePlacementDenial } from './delivery-registry-publish.mts'
import { lockImageAssetAdmission, assertImagesReadyForSurface } from './asset-admission-lock.mts'

export * from './delivery-registry.mts'
export { lockImageAssetMutation } from './asset-mutation-lock.mts'
export {
  lockImageAssetAdmission,
  assertImagesReadyForSurface,
  prepareImageSurfaceAdmission,
  markImageDeliveryAuthorityStarted,
} from './asset-admission-lock.mts'
export { lockImageDeliveryMutation } from './delivery-lock.mts'
export { assertImageDeliveryTransaction } from './transaction-contract.mts'
export { syncImageSurfacePlacement } from './surface-placement-sync.mts'
export type { ImagePlacementTuple } from '@voucha/types/entities/user'
export { ensureImagePlacementBinding } from './retained-image-identities.mts'
export {
  lockUserProfileImageOwners,
  lockUserProfileLinkImageOwners,
  type ImageSurfaceReference,
} from './surface-lock.mts'

export async function prepublishImageSurfaceDenials(
  references: (ImageSurfaceReference & { nextImageId?: string | null })[],
  query: QueryExecutor,
): Promise<void> {
  // A multi-slot owner takes its entire placement domain before any provider transition.
  const ordered = references.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const tuples: {
    placement_id: string
    placement_revision: number
    image_id: string
    same_image: boolean
  }[] = []
  const changedImageIds: string[] = []
  await lockImageAssetAdmission(
    ordered.flatMap(reference => (reference.nextImageId ? [reference.nextImageId] : [])),
    query,
  )
  await lockImageSurfacePlacements(ordered, query)
  const statement = sql`/* prepublishImageSurfaceDenial:current */
    WITH refs AS (`
  statement.append(imageSurfaceReferences(ordered))
  statement.append(sql`)
    SELECT refs.ordinality, current.placement_id, current.placement_revision,
      current.image_id, current.image_id = refs.next_image_id AS same_image
    FROM refs
    LEFT JOIN LATERAL (
      SELECT surface.placement_id, placement.revision AS placement_revision, surface.image_id
      FROM image_surface_placements surface
      JOIN media_placements placement ON placement.id = surface.placement_id
      WHERE surface.surface_kind = refs.surface_kind
        AND (surface.user_id = refs.user_id OR surface.topic_id = refs.topic_id
          OR surface.community_id = refs.community_id
          OR surface.user_profile_link_id = refs.user_profile_link_id)
        AND placement.retired_at IS NULL
      ORDER BY placement.id DESC LIMIT 1
    ) current ON true
    ORDER BY refs.ordinality`)
  const { rows } = ordered.length
    ? await query<{
        ordinality: string
        placement_id: string | null
        placement_revision: number | null
        image_id: string | null
        same_image: boolean | null
      }>(statement)
    : { rows: [] }
  for (const row of rows) {
    const reference = ordered[Number(row.ordinality) - 1]!
    if (reference.nextImageId && !row.same_image) changedImageIds.push(reference.nextImageId)
    if (
      row.placement_id &&
      row.placement_revision !== null &&
      row.image_id &&
      (!('nextImageId' in reference) || !row.same_image)
    ) {
      tuples.push({
        placement_id: row.placement_id,
        placement_revision: row.placement_revision,
        image_id: row.image_id,
        same_image: row.same_image ?? false,
      })
    }
  }
  await assertImagesReadyForSurface(changedImageIds, query)
  for (const current of tuples) {
    // oxlint-disable-next-line no-await-in-loop -- every tuple denial precedes the owner mutation.
    await prepublishImagePlacementDenial(
      {
        placementId: current.placement_id,
        revision: current.placement_revision,
        imageId: current.image_id,
      },
      { query },
    )
  }
}
