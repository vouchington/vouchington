import { write } from '@data-stores/psql'
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
