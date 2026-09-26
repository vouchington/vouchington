import { beginTransaction, read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'

/** Seeds the durable post-review crash boundary without invoking its downstream effects. */
export async function createTestCopyrightFormIntakeReview(
  input: { intakeId: string; moderatorId: string; accepted: boolean },
  options: QueryOptions = {},
): Promise<void> {
  const query = options.query ?? write
  await query(sql`/* createTestCopyrightFormIntakeReview */
    INSERT INTO copyright_notice_form_intake_reviews (
      copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
    ) VALUES (
      ${input.intakeId}, CURRENT_TIMESTAMP, ${input.moderatorId}, ${input.accepted},
      ${encryptSecret('test rejection', `copyright-form-review:${input.intakeId}`)}
    )
  `)
}

/**
 * Seeds a durable rejection whose moderator is already erased. The review and the erasure commit
 * together, so no concurrent recovery sweep can lock a review that still names a live moderator
 * while the erasure holds that moderator's row.
 */
export async function createTestCopyrightFormRejectionByErasedModerator(input: {
  intakeId: string
  moderatorId: string
}): Promise<void> {
  await using transaction = await beginTransaction()
  await createTestCopyrightFormIntakeReview({ ...input, accepted: false }, { query: transaction })
  const { rowCount } = await transaction(sql`
    /* createTestCopyrightFormRejectionByErasedModerator:erase */
    DELETE FROM users WHERE id = ${input.moderatorId}
  `)
  if (rowCount !== 1)
    throw new Error(`Copyright form review moderator was not erased: ${input.moderatorId}`)
  await transaction.commit()
}

/** Reads the actor-erasure result for one immutable form review. */
export async function readTestCopyrightFormReviewActor(intakeId: string): Promise<string | null> {
  const { rows } = await read<{ reviewed_by_id: string | null }>(sql`
    /* readTestCopyrightFormReviewActor */
    SELECT reviewed_by_id FROM copyright_notice_form_intake_reviews
    WHERE copyright_notice_form_intake_id = ${intakeId}
  `)
  if (!rows[0]) throw new Error(`Copyright form review was not found: ${intakeId}`)
  return rows[0].reviewed_by_id
}

/** Reads an owned automated enforcement request after reconciliation. */
export async function readTestCopyrightEnforcementRequestState(
  assessmentId: string,
): Promise<string | null> {
  const { rows } = await write<{ state: string }>(sql`
    /* readTestCopyrightEnforcementRequestState */
    SELECT state FROM copyright_notice_enforcement_requests
    WHERE copyright_notice_submission_assessment_id = ${assessmentId}
  `)
  return rows[0]?.state ?? null
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
