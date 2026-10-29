import { beginTransaction, read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { openCopyrightSecrets } from '../../../services/copyright-notices/encryption-keys.mts'

/** Seeds the durable post-review crash boundary without invoking its downstream effects. */
export async function createTestCopyrightFormIntakeReview(
  input: { intakeId: string; moderatorId: string; is_accepted: boolean },
  query?: TransactionQuery,
): Promise<void> {
  if (query) {
    await using secrets = await openCopyrightSecrets(
      { kind: 'form_intake', id: input.intakeId },
      query,
      'write',
    )
    await insertReview(
      query,
      secrets.encryptSecret('test rejection', `copyright-form-review:${input.intakeId}`),
      input,
    )
    return
  }
  await using transaction = await beginTransaction()
  await using secrets = await openCopyrightSecrets(
    { kind: 'form_intake', id: input.intakeId },
    transaction,
    'write',
  )
  await insertReview(
    transaction,
    secrets.encryptSecret('test rejection', `copyright-form-review:${input.intakeId}`),
    input,
  )
  await transaction.commit()
}

async function insertReview(
  query: TransactionQuery,
  rationaleCiphertext: string,
  input: { intakeId: string; moderatorId: string; is_accepted: boolean },
): Promise<void> {
  await query(sql`/* createTestCopyrightFormIntakeReview */
    INSERT INTO copyright_notice_form_intake_reviews (
      copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext
    ) VALUES (
      ${input.intakeId}, CURRENT_TIMESTAMP, ${input.moderatorId}, ${input.is_accepted},
      ${rationaleCiphertext}
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
  await createTestCopyrightFormIntakeReview({ ...input, is_accepted: false }, transaction)
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

/** Marks an already-authorized restriction lifted to exercise durable reconciliation guards. */
export async function liftTestCopyrightRestriction(
  restrictionId: string,
  liftedAt = new Date(),
): Promise<void> {
  await write(sql`/* liftTestCopyrightRestriction */
    UPDATE copyright_restrictions
    SET lifted_at = ${liftedAt}, lifted_by_id = NULL
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
