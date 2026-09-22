import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'

/** Seeds the durable post-review crash boundary without invoking its downstream effects. */
export async function createTestCopyrightFormIntakeReview(input: {
  intakeId: string
  moderatorId: string
  accepted: boolean
}): Promise<void> {
  await write(sql`/* createTestCopyrightFormIntakeReview */
    INSERT INTO copyright_notice_form_intake_reviews (
      copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
    ) VALUES (
      ${input.intakeId}, CURRENT_TIMESTAMP, ${input.moderatorId}, ${input.accepted},
      ${encryptSecret('test rejection', `copyright-form-review:${input.intakeId}`)}
    )
  `)
}

/** Marks an already-authorized restriction lifted to exercise durable reconciliation guards. */
export async function liftTestCopyrightRestriction(restrictionId: string): Promise<void> {
  await write(sql`/* liftTestCopyrightRestriction */
    UPDATE copyright_restrictions
    SET lifted_at = CURRENT_TIMESTAMP, lifted_by_id = NULL
    WHERE id = ${restrictionId} AND lifted_at IS NULL
  `)
}

/** Simulates an owned durable enforcement request that predates the shared test database. */
export async function ageTestCopyrightEnforcementRequest(assessmentId: string): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    copyright_notice_id: string
    imposed_by_id: string | null
  }>(sql`/* ageTestCopyrightEnforcementRequest:remove */
    DELETE FROM copyright_notice_enforcement_requests
    WHERE copyright_notice_submission_assessment_id = ${assessmentId} AND state = 'pending'
    RETURNING copyright_notice_id, imposed_by_id
  `)
  const request = rows[0]
  if (!request) throw new Error('Expected an owned pending copyright enforcement request')
  await transaction(sql`/* ageTestCopyrightEnforcementRequest:insert */
    INSERT INTO copyright_notice_enforcement_requests (
      copyright_notice_submission_assessment_id, copyright_notice_id, imposed_by_id, updated_at
    ) VALUES (${assessmentId}, ${request.copyright_notice_id}, ${request.imposed_by_id},
      '2000-01-01'::timestamptz)
  `)
  await transaction.commit()
}

export async function readTestLatestCopyrightFormScreeningRecommendation(
  intakeId: string,
): Promise<string | null> {
  const { rows } = await write<{ recommendation: string }>(
    sql`/* readTestLatestCopyrightFormScreeningRecommendation */
      SELECT recommendation FROM copyright_notice_form_screenings
      WHERE copyright_notice_form_intake_id = ${intakeId}
      ORDER BY id DESC LIMIT 1`,
  )
  return rows[0]?.recommendation ?? null
}
