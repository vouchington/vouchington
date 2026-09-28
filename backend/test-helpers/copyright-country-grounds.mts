import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightGroundApplicability } from '../services/copyright-notices/ground-applicability.mts'

export async function imposeTestCopyrightGround(input: {
  placementId: string
  imageId: string
  assessedById: string
  applicability: Parameters<typeof copyrightGroundApplicability>[0]
}): Promise<{ restrictionId: string }> {
  const applicability = copyrightGroundApplicability(input.applicability)
  const countryCodes = applicability.scope === 'countries' ? [...applicability.countryCodes] : []
  const { rows } = await write<{ restriction_id: string }>(sql`/* imposeTestCopyrightGround */
    WITH notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext,
        work_description, policy_version
      ) VALUES (
        'other', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        ${`v1:test-contact:${randomUUID()}`}, ${`Country ground ${randomUUID()}`}, 'test'
      ) RETURNING id
    ), target AS (
      INSERT INTO copyright_notice_targets (
        copyright_notice_id, placement_key, placement_revision, hosted_use_url
      ) SELECT notice.id, ${`image-placement:${input.placementId}`}, 1,
        ${`https://example.test/${randomUUID()}`}
      FROM notice RETURNING id
    ), image_target AS (
      INSERT INTO copyright_notice_target_images (copyright_notice_target_id, image_id)
      SELECT target.id, ${input.imageId} FROM target
    ), submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) SELECT notice.id, 'notice', CURRENT_TIMESTAMP, 'staff', ${`v1:test-body:${randomUUID()}`}
      FROM notice RETURNING id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
      ) SELECT submission.id, CURRENT_TIMESTAMP, ${input.assessedById}, true FROM submission
      RETURNING id
    ), restriction AS (
      INSERT INTO copyright_restrictions (
        copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id, applicability
      ) SELECT target.id, assessment.id, CURRENT_TIMESTAMP, ${input.assessedById}, ${applicability.scope}
      FROM target CROSS JOIN assessment RETURNING id
    ), countries AS (
      INSERT INTO copyright_restriction_countries (copyright_restriction_id, country_code)
      SELECT restriction.id, country_code FROM restriction
      CROSS JOIN unnest(${countryCodes}::text[]) AS country_code
      WHERE ${applicability.scope} = 'countries'
      RETURNING copyright_restriction_id
    )
    SELECT restriction.id AS restriction_id FROM restriction
  `)
  const restrictionId = rows[0]?.restriction_id
  if (!restrictionId) throw new Error('copyright ground was not imposed')
  return { restrictionId }
}

export async function liftTestCopyrightRestriction(restrictionId: string): Promise<void> {
  const { rowCount } = await write(sql`/* liftTestCopyrightRestriction */
    UPDATE copyright_restrictions
    SET lifted_at = CURRENT_TIMESTAMP
    WHERE id = ${restrictionId} AND lifted_at IS NULL
  `)
  if (rowCount !== 1) throw new Error(`copyright restriction ${restrictionId} was not lifted`)
}

export async function readTestDeniedCountryCodes(deliveryKey: string): Promise<string[]> {
  const { rows } = await read<{ country_code: string }>(sql`/* readTestDeniedCountryCodes */
    SELECT country_code FROM media_delivery_registry_denied_countries
    WHERE delivery_key = ${deliveryKey}
    ORDER BY country_code
  `)
  return rows.map(row => row.country_code)
}
