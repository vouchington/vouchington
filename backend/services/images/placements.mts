import { read, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightPlacementHostIsLiveSql } from './placement-copyright-host-sql.mts'
import {
  toCopyrightImagePlacement,
  type CopyrightImagePlacement,
  type CopyrightImagePlacementRow,
} from './placement-copyright-types.mts'

export { getImagePlacementCopyrightOwner } from './placement-owner.mts'

export type { CopyrightImagePlacement } from './placement-copyright-types.mts'

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
  placementId: string,
  options: QueryOptions = {},
): Promise<CopyrightImagePlacement | null> {
  const query = options.query ?? read
  const { rows } = await query<CopyrightImagePlacementRow>(
    buildCopyrightPlacementReadSql(placementId),
  )
  const placement = rows[0]
  if (!placement) return null
  return toCopyrightImagePlacement(placement)
}

function buildCopyrightPlacementReadSql(placementId: string): ReturnType<typeof sql> {
  const statement = sql`/* getImagePlacementForCopyright */
    SELECT placement.id AS placement_id, placement.revision, binding.image_id,
      placement.retired_at, placement.copyright_withheld_at,
      image.deleted_at AS image_deleted_at,
      image.quarantine_pending_at AS image_quarantine_pending_at,
      image.openai_omni_moderation_flagged AS image_moderation_flagged, `
  statement.append(copyrightPlacementHostIsLiveSql())
  statement.append(sql` AS host_live
    FROM media_placements placement
    JOIN retained_image_placement_bindings binding ON binding.placement_id = placement.id
    JOIN images image ON image.id = binding.image_id
    LEFT JOIN image_placements post_binding ON post_binding.placement_id = placement.id
    LEFT JOIN posts post ON post.id = post_binding.post_id
    LEFT JOIN image_surface_placements surface ON surface.placement_id = placement.id
    WHERE placement.id = ${placementId}
  `)
  return statement
}

export async function withholdImagePlacementForCopyright(
  input: { placementId: string; expectedRevision: number },
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation> {
  return changeImagePlacementCopyrightWithholding(input, true, options)
}

export async function restoreImagePlacementForCopyright(
  input: { placementId: string; expectedRevision: number },
  options: QueryOptions = {},
): Promise<CopyrightImagePlacementMutation> {
  return changeImagePlacementCopyrightWithholding(input, false, options)
}

async function changeImagePlacementCopyrightWithholding(
  input: { placementId: string; expectedRevision: number },
  withhold: boolean,
  options: QueryOptions,
): Promise<CopyrightImagePlacementMutation> {
  const query = options.query ?? write
  const { rows } = await query<CopyrightImagePlacementRow>(
    buildCopyrightPlacementMutationSql(input, withhold),
  )
  const updated = rows[0]
  if (updated) return { status: 'applied', placement: toCopyrightImagePlacement(updated) }

  const current = await getImagePlacementForCopyright(input.placementId, options)
  if (!current) return { status: 'not_found' }
  if (current.deleted) return { status: 'deleted', placement: current }
  const desiredApplied = withhold ? current.withheld : !current.withheld
  if (desiredApplied && current.revision === input.expectedRevision + 1) {
    return { status: 'already_applied', placement: current }
  }
  return { status: 'stale', placement: current }
}

function buildCopyrightPlacementMutationSql(
  input: { placementId: string; expectedRevision: number },
  withhold: boolean,
): ReturnType<typeof sql> {
  const statement = sql`/* changeImagePlacementCopyrightWithholding */
    UPDATE media_placements placement
    SET copyright_withheld_at = CASE WHEN ${withhold} THEN CURRENT_TIMESTAMP ELSE NULL END,
        revision = placement.revision + 1
    FROM retained_image_placement_bindings binding
    JOIN images image ON image.id = binding.image_id
    LEFT JOIN image_placements post_binding ON post_binding.placement_id = binding.placement_id
    LEFT JOIN posts post ON post.id = post_binding.post_id
    LEFT JOIN image_surface_placements surface ON surface.placement_id = binding.placement_id
    WHERE placement.id = binding.placement_id
      AND placement.id = ${input.placementId}
      AND placement.revision = ${input.expectedRevision}
      AND placement.retired_at IS NULL
      AND (
        (${withhold} AND placement.copyright_withheld_at IS NULL)
        OR (NOT ${withhold} AND placement.copyright_withheld_at IS NOT NULL)
      )
      AND image.deleted_at IS NULL
      AND `
  statement.append(copyrightPlacementHostIsLiveSql())
  statement.append(sql`
      AND image.quarantine_pending_at IS NULL
      AND image.openai_omni_moderation_flagged IS NOT TRUE
    RETURNING placement.id AS placement_id, placement.revision, binding.image_id,
      placement.retired_at, placement.copyright_withheld_at,
      image.deleted_at AS image_deleted_at,
      image.quarantine_pending_at AS image_quarantine_pending_at,
      image.openai_omni_moderation_flagged AS image_moderation_flagged, `)
  statement.append(copyrightPlacementHostIsLiveSql())
  statement.append(sql` AS host_live`)
  return statement
}
