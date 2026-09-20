import { read, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export { getPostIdForImagePlacementCopyright } from './placement-post.mts'

export type CopyrightImagePlacement = {
  placementKey: string
  placementId: string
  revision: number
  imageId: string
  deleted: boolean
  withheld: boolean
  safetyBlocked: boolean
}

export type ImagePlacementRetirement = { placementId: string; revision: number }

export type CopyrightImagePlacementMutation =
  | { status: 'applied' | 'already_applied'; placement: CopyrightImagePlacement }
  | { status: 'stale' | 'deleted'; placement: CopyrightImagePlacement }
  | { status: 'not_found' }

export function getImagePlacementKey(placementId: string): string {
  return `image-placement:${placementId}`
}

export async function retireImagePlacementsForDeletedImage(
  imageId: string,
  query: TransactionQuery,
): Promise<Array<{ placementId: string; revision: number }>> {
  const { rows } = await query<{ placement_id: string; revision: number }>(
    sql`/* retireImagePlacementsForDeletedImage */
      UPDATE media_placements placement
      SET retired_at = CURRENT_TIMESTAMP,
          retirement_reason = 'asset_deleted',
          revision = placement.revision + 1
      FROM image_placements image_placement
      WHERE image_placement.placement_id = placement.id
        AND image_placement.image_id = ${imageId}
        AND placement.retired_at IS NULL
      RETURNING placement.id AS placement_id, placement.revision
    `,
  )
  return rows.map(row => ({ placementId: row.placement_id, revision: row.revision }))
}

export async function restoreImagePlacementsAfterImageDeletion(
  placements: ImagePlacementRetirement[],
  query: TransactionQuery,
): Promise<void> {
  for (const placement of placements) {
    // oxlint-disable-next-line no-await-in-loop -- each revision fence protects its own prior deletion transition.
    await query(sql`/* restoreImagePlacementsAfterImageDeletion */
      UPDATE media_placements
      SET retired_at = NULL,
          retirement_reason = NULL,
          revision = revision + 1
      WHERE id = ${placement.placementId}
        AND revision = ${placement.revision}
        AND retirement_reason = 'asset_deleted'
    `)
  }
}

export async function getImagePlacementForCopyright(
  placementKey: string,
  options: QueryOptions = {},
): Promise<CopyrightImagePlacement | null> {
  const query = options.query ?? read
  const { rows } = await query<{
    placement_id: string
    revision: number
    image_id: string
    retired_at: Date | null
    copyright_withheld_at: Date | null
    image_deleted_at: Date | null
    post_deleted_at: Date | null
    image_quarantine_pending_at: Date | null
    image_moderation_flagged: boolean | null
  }>(sql`/* getImagePlacementForCopyright */
    SELECT placement.id AS placement_id, placement.revision, image_placement.image_id,
      placement.retired_at, placement.copyright_withheld_at,
      image.deleted_at AS image_deleted_at, post.deleted_at AS post_deleted_at,
      image.quarantine_pending_at AS image_quarantine_pending_at,
      image.openai_omni_moderation_flagged AS image_moderation_flagged
    FROM media_placements placement
    JOIN image_placements image_placement ON image_placement.placement_id = placement.id
    JOIN images image ON image.id = image_placement.image_id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE placement.placement_kind = 'image'
      AND ${placementKey} = concat('image-placement:', placement.id)
  `)
  const placement = rows[0]
  if (!placement) return null
  return toCopyrightImagePlacement(placement)
}

export async function withholdImagePlacementForCopyright(
  input: { placementKey: string; expectedRevision: number },
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation> {
  return await changeImagePlacementCopyrightWithholding(input, true, options)
}

export async function restoreImagePlacementForCopyright(
  input: { placementKey: string; expectedRevision: number },
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation> {
  return await changeImagePlacementCopyrightWithholding(input, false, options)
}

async function changeImagePlacementCopyrightWithholding(
  input: { placementKey: string; expectedRevision: number },
  withhold: boolean,
  options: QueryOptions,
): Promise<CopyrightImagePlacementMutation> {
  const query = options.query ?? write
  const { rows } = await query<{
    placement_id: string
    revision: number
    image_id: string
    retired_at: Date | null
    copyright_withheld_at: Date | null
    image_deleted_at: Date | null
    post_deleted_at: Date | null
    image_quarantine_pending_at: Date | null
    image_moderation_flagged: boolean | null
  }>(sql`/* changeImagePlacementCopyrightWithholding */
    UPDATE media_placements placement
    SET copyright_withheld_at = CASE WHEN ${withhold} THEN CURRENT_TIMESTAMP ELSE NULL END,
        revision = placement.revision + 1
    FROM image_placements image_placement
    JOIN images image ON image.id = image_placement.image_id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE placement.id = image_placement.placement_id
      AND placement.placement_kind = 'image'
      AND ${input.placementKey} = concat('image-placement:', placement.id)
      AND placement.revision = ${input.expectedRevision}
      AND placement.retired_at IS NULL
      AND (
        (${withhold} AND placement.copyright_withheld_at IS NULL)
        OR (NOT ${withhold} AND placement.copyright_withheld_at IS NOT NULL)
      )
      AND image.deleted_at IS NULL
      AND post.deleted_at IS NULL
      AND image.quarantine_pending_at IS NULL
      AND image.openai_omni_moderation_flagged IS NOT TRUE
    RETURNING placement.id AS placement_id, placement.revision, image_placement.image_id,
      placement.retired_at, placement.copyright_withheld_at,
      image.deleted_at AS image_deleted_at, post.deleted_at AS post_deleted_at,
      image.quarantine_pending_at AS image_quarantine_pending_at,
      image.openai_omni_moderation_flagged AS image_moderation_flagged
  `)
  const updated = rows[0]
  if (updated) return { status: 'applied', placement: toCopyrightImagePlacement(updated) }

  const current = await getImagePlacementForCopyright(input.placementKey, options)
  if (!current) return { status: 'not_found' }
  if (current.deleted) return { status: 'deleted', placement: current }
  const desiredApplied = withhold ? current.withheld : !current.withheld
  if (desiredApplied && current.revision === input.expectedRevision + 1) {
    return { status: 'already_applied', placement: current }
  }
  return { status: 'stale', placement: current }
}

function toCopyrightImagePlacement(placement: {
  placement_id: string
  revision: number
  image_id: string
  retired_at: Date | null
  copyright_withheld_at: Date | null
  image_deleted_at: Date | null
  post_deleted_at: Date | null
  image_quarantine_pending_at: Date | null
  image_moderation_flagged: boolean | null
}): CopyrightImagePlacement {
  return {
    placementKey: getImagePlacementKey(placement.placement_id),
    placementId: placement.placement_id,
    revision: placement.revision,
    imageId: placement.image_id,
    deleted:
      placement.retired_at !== null ||
      placement.image_deleted_at !== null ||
      placement.post_deleted_at !== null ||
      placement.image_quarantine_pending_at !== null ||
      placement.image_moderation_flagged === true,
    withheld: placement.copyright_withheld_at !== null,
    safetyBlocked:
      placement.image_quarantine_pending_at !== null || placement.image_moderation_flagged === true,
  }
}
