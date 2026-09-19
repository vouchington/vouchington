import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeRecord, CreateCopyrightNoticeAggregateInput } from './types.mts'

export async function createCopyrightNoticeAggregate(
  input: CreateCopyrightNoticeAggregateInput,
): Promise<CopyrightNoticeRecord> {
  assert(input.targets.length > 0, 422, 'A copyright notice requires at least one hosted target')
  await using transaction = await beginTransaction()
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
      placement_key: target.placementKey,
      placement_revision: target.placementRevision,
      image_id: target.imageId,
      hosted_use_url: target.hostedUseUrl,
    })),
  )
  await transaction(sql`/* createCopyrightNoticeAggregate:targets */
    WITH target_inputs AS (
      SELECT *
      FROM jsonb_to_recordset(${serializedTargets}::jsonb) AS target_input(
        placement_key text,
        placement_revision integer,
        image_id uuid,
        hosted_use_url text
      )
    ), inserted_targets AS (
      INSERT INTO copyright_notice_targets (
        copyright_notice_id, placement_key, placement_revision, hosted_use_url
      )
      SELECT ${notice.id}, placement_key, placement_revision, hosted_use_url
      FROM target_inputs
      RETURNING id, placement_key, placement_revision
    )
    INSERT INTO copyright_notice_target_images (copyright_notice_target_id, image_id)
    SELECT inserted_targets.id, target_inputs.image_id
    FROM inserted_targets
    INNER JOIN target_inputs USING (placement_key, placement_revision)
  `)
  await transaction(sql`/* createCopyrightNoticeAggregate:submission */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, submitted_by_user_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${notice.id}, ${input.claimantUserId}, 'notice', ${input.receivedAt},
      ${input.initialSubmission.sourceKind}, ${input.initialSubmission.bodyCiphertext}
    )
  `)
  await transaction(sql`/* createCopyrightNoticeAggregate:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, metadata)
    VALUES (${notice.id}, 'notice_received', '{}'::jsonb)
  `)
  await transaction.commit()
  return notice
}
