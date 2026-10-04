import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeTargetInput } from './types.mts'

/** Capture a hosted placement's current generation with its notice target in one transaction. */
export async function insertCopyrightNoticeTargetsInTransaction(
  noticeId: string,
  targets: CopyrightNoticeTargetInput[],
  transaction: TransactionQuery,
): Promise<void> {
  assert(targets.length > 0, 422, 'A copyright notice requires at least one hosted target')
  const surfaceTargets = targets.filter(target => target.bindingFamily === 'surface')
  if (surfaceTargets.length > 0) {
    const ids = [...new Set(surfaceTargets.map(target => target.placementId))].toSorted()
    const { rows: lockedPlacements } = await transaction<{ id: string; revision: number }>(sql`
      /* insertCopyrightNoticeTargets:lockSurfaceEpochs */
      SELECT id, revision FROM media_placements WHERE id = ANY(${ids}::uuid[])
      ORDER BY id FOR UPDATE
    `)
    const current = new Map(lockedPlacements.map(row => [row.id, row.revision]))
    assert(
      surfaceTargets.every(target => current.get(target.placementId) === target.placementRevision),
      409,
      'Hosted image placement changed before notice capture',
    )
  }
  const serializedTargets = JSON.stringify(
    targets.map(target => ({
      placement_id: target.placementId,
      placement_revision: target.placementRevision,
      image_id: target.imageId,
      binding_family: target.bindingFamily,
      hosted_use_url: target.hostedUseUrl,
    })),
  )
  const insertion = await transaction(sql`/* insertCopyrightNoticeTargets */
    WITH target_inputs AS (
      SELECT * FROM jsonb_to_recordset(${serializedTargets}::jsonb) AS target_input(
        placement_id uuid, placement_revision integer, image_id uuid,
        binding_family text, hosted_use_url text
      )
    ), inserted_targets AS (
      INSERT INTO copyright_notice_targets (
        copyright_notice_id, placement_id, placement_revision, surface_activation_revision,
        surface_owner_user_id, hosted_use_url
      )
      SELECT ${noticeId}, target_input.placement_id, target_input.placement_revision,
        CASE WHEN target_input.binding_family = 'surface' THEN placement.activation_revision ELSE NULL END,
        CASE surface.surface_kind
          WHEN 'user-profile-image' THEN surface.user_id
          WHEN 'user-profile-link-image' THEN link.user_id
          ELSE NULL END,
        target_input.hosted_use_url
      FROM target_inputs target_input
      JOIN media_placements placement ON placement.id = target_input.placement_id
      LEFT JOIN image_surface_placements surface ON surface.placement_id = target_input.placement_id
      LEFT JOIN user_profile_links link ON link.id = surface.user_profile_link_id
      RETURNING id, placement_id, placement_revision
    )
    INSERT INTO copyright_notice_target_images (
      copyright_notice_target_id, placement_id, image_id, binding_family
    )
    SELECT inserted_targets.id, inserted_targets.placement_id,
      target_inputs.image_id, target_inputs.binding_family
    FROM inserted_targets
    INNER JOIN target_inputs USING (placement_id, placement_revision)
  `)
  assert(insertion.rowCount === targets.length, 422, 'Hosted image placement was not found')
}
