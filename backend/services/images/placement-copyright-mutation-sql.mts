import sql from 'sql-template-strings'
import { copyrightPlacementHostIsLiveSql } from './placement-copyright-host-sql.mts'

/** One UPDATE for many copyright withhold or restore revisions. */
export function buildCopyrightPlacementsMutationSql(
  placementIds: readonly string[],
  expectedRevisions: readonly number[],
  withhold: boolean,
): ReturnType<typeof sql> {
  const statement = sql`/* changeImagePlacementsCopyrightWithholding */
    UPDATE media_placements placement
    SET copyright_withheld_at = CASE WHEN ${withhold} THEN CURRENT_TIMESTAMP ELSE NULL END,
        revision = placement.revision + 1
    FROM unnest(${placementIds}::uuid[], ${expectedRevisions}::integer[]) AS input(placement_id, expected_revision)
    JOIN retained_image_placement_bindings binding ON binding.placement_id = input.placement_id
    JOIN images image ON image.id = binding.image_id
    LEFT JOIN image_placements post_binding ON post_binding.placement_id = binding.placement_id
    LEFT JOIN posts post ON post.id = post_binding.post_id
    LEFT JOIN image_surface_placements surface ON surface.placement_id = binding.placement_id
    WHERE placement.id = input.placement_id
      AND placement.revision = input.expected_revision
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
      AND image.is_flagged_by_openai_omni_moderation IS NOT TRUE
    RETURNING placement.id AS placement_id, placement.revision, binding.image_id,
      placement.retired_at, placement.copyright_withheld_at,
      image.deleted_at AS image_deleted_at,
      image.quarantine_pending_at AS image_quarantine_pending_at,
      image.is_flagged_by_openai_omni_moderation AS image_moderation_flagged, `)
  statement.append(copyrightPlacementHostIsLiveSql())
  statement.append(sql` AS host_live`)
  return statement
}
