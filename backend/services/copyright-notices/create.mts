import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeRecord, CreateCopyrightNoticeAggregateInput } from './types.mts'

/** Internal transaction-aware variant for admission records which must commit with a legal case. */
export async function createCopyrightNoticeAggregateInTransaction(
  input: CreateCopyrightNoticeAggregateInput,
  transaction: TransactionQuery,
): Promise<CopyrightNoticeRecord> {
  assert(input.jurisdiction === 'us_dmca', 422, 'Only US DMCA notices use this aggregate')
  assert(input.targets.length > 0, 422, 'A copyright notice requires at least one hosted target')
  const surfaceTargets = input.targets.filter(target => target.bindingFamily === 'surface')
  if (surfaceTargets.length > 0) {
    const ids = [...new Set(surfaceTargets.map(target => target.placementId))].toSorted()
    const { rows: lockedPlacements } = await transaction<{ id: string; revision: number }>(sql`
      /* createCopyrightNoticeAggregate:lockSurfaceEpochs */
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
  const { rows } = await transaction<CopyrightNoticeRecord>(sql`/* createCopyrightNoticeAggregate */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, claimant_user_id, claimant_display_name,
      claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      ${input.jurisdiction}, 'copyright', ${input.receivedAt}, ${input.claimantUserId},
      ${input.claimantDisplayName}, ${input.claimantContactCiphertext}, ${input.workDescription},
      ${input.policyVersion}
    )
    RETURNING id, jurisdiction, legal_basis, received_at, accepted_at, provisional_withholding_at,
      claimant_user_id, claimant_display_name, claimant_contact_ciphertext, work_description,
      policy_version
  `)
  const notice = rows[0]
  assert(notice, 500, 'Failed to create copyright notice')
  const serializedTargets = JSON.stringify(
    input.targets.map(target => ({
      placement_id: target.placementId,
      placement_revision: target.placementRevision,
      image_id: target.imageId,
      binding_family: target.bindingFamily,
      hosted_use_url: target.hostedUseUrl,
    })),
  )
  const [targetInsertion] = await Promise.all([
    transaction(sql`/* createCopyrightNoticeAggregate:targets */
    WITH target_inputs AS (
      SELECT *
      FROM jsonb_to_recordset(${serializedTargets}::jsonb) AS target_input(
        placement_id uuid,
        placement_revision integer,
        image_id uuid,
        binding_family text,
        hosted_use_url text
      )
    ), inserted_targets AS (
      INSERT INTO copyright_notice_targets (
        copyright_notice_id, placement_id, placement_revision, surface_activation_revision,
        surface_owner_user_id, hosted_use_url
      )
      SELECT ${notice.id}, target_input.placement_id, target_input.placement_revision,
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
    INSERT INTO copyright_notice_target_images (copyright_notice_target_id, placement_id, image_id, binding_family)
    SELECT inserted_targets.id, inserted_targets.placement_id, target_inputs.image_id, target_inputs.binding_family
    FROM inserted_targets
    INNER JOIN target_inputs USING (placement_id, placement_revision)
  `),
    transaction(sql`/* createCopyrightNoticeAggregate:submission */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, submitted_by_user_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${notice.id}, ${input.claimantUserId}, 'notice', ${input.receivedAt},
      ${input.initialSubmission.sourceKind}, ${input.initialSubmission.bodyCiphertext}
    )
  `),
    transaction(sql`/* createCopyrightNoticeAggregate:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type)
    VALUES (${notice.id}, 'notice_received')
  `),
  ])
  assert(
    targetInsertion.rowCount === input.targets.length,
    422,
    'Hosted image placement was not found',
  )
  return notice
}
