import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect } from './entities/index.mts'

export async function seedCopyrightIntakeLegalDelivery(intakeId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* seedCopyrightIntakeLegalDelivery */
    INSERT INTO copyright_notice_delivery_work_items (
      copyright_notice_email_intake_receipt_id, recipient_role, delivery_kind, channel,
      idempotency_key, body_ciphertext, delivery_attempted_at, sent_at
    ) VALUES (
      ${intakeId}, 'correspondent', 'email_intake_received', 'email',
      ${`retention-delivery-${randomUUID()}`}, 'v1:receipt', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING id`)
  return rows[0]!.id
}

export async function readCopyrightIntakeLegalDelivery(id: string): Promise<{
  id: string
  body_ciphertext: string
  failure_ciphertext: string | null
  state: string
  updated_at: Date
  sent_at: Date
  idempotency_key: string
} | null> {
  const { rows } = await read<{
    id: string
    body_ciphertext: string
    failure_ciphertext: string | null
    state: string
    updated_at: Date
    sent_at: Date
    idempotency_key: string
  }>(sql`/* readCopyrightIntakeLegalDelivery */
    SELECT id, body_ciphertext, failure_ciphertext, state, updated_at, sent_at, idempotency_key
    FROM copyright_notice_delivery_work_items WHERE id = ${id}`)
  return rows[0] ?? null
}

export async function seedCopyrightIntakeAuditReview(
  intakeId: string,
  reviewedAt = new Date(),
): Promise<{
  reviewId: string
  recommendationId: string
}> {
  const reviewer = await createTestUserDirect()
  const recommendationId = uuidv7()
  const inputSha256 = randomBytes(32)
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightIntakeAuditRecommendationIdentity */
    INSERT INTO copyright_notice_email_intake_recommendation_identities
      (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version)
    VALUES (${recommendationId}, ${intakeId}, ${inputSha256}, 'retention-test-v1')`)
  await transaction(sql`
    /* seedCopyrightIntakeAuditRecommendation */
    INSERT INTO copyright_notice_email_intake_recommendations
      (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version, model,
       structured_output_ciphertext)
    VALUES (${recommendationId}, ${intakeId}, ${inputSha256}, 'retention-test-v1', 'test-model', 'v1:advisory')`)
  await transaction(sql`/* seedCopyrightIntakeAuditRecommendationOwner */
    UPDATE copyright_notice_email_intakes SET
      current_recommendation_identity_id = ${recommendationId},
      current_recommendation_output_ciphertext = 'v1:advisory',
      recommendation_completed_at = ${reviewedAt}
    WHERE id = ${intakeId}`)
  const { rows } = await transaction<{ id: string }>(sql`/* seedCopyrightIntakeAuditReview */
    INSERT INTO copyright_notice_email_intake_reviews
      (copyright_notice_email_intake_receipt_id, copyright_notice_email_intake_recommendation_id,
       reviewed_by_id, reviewed_at, decision, rationale_ciphertext)
    VALUES (${intakeId}, ${recommendationId}, ${reviewer.id}, ${reviewedAt},
      'rejected', 'v1:test-rationale')
    RETURNING id`)
  await transaction(sql`/* seedCopyrightIntakeAuditReviewOwner */
    UPDATE copyright_notice_email_intake_receipts SET
      review_decision = 'rejected', reviewed_at = ${reviewedAt}, reviewed_by_id = ${reviewer.id}
    WHERE id = ${intakeId}`)
  await transaction.commit()
  return { reviewId: rows[0]!.id, recommendationId }
}

export async function readCopyrightIntakeAuditRecommendation(id: string): Promise<{
  id: string
  structured_output_ciphertext: string
} | null> {
  const { rows } = await read<{ id: string; structured_output_ciphertext: string }>(sql`
    /* readCopyrightIntakeAuditRecommendation */
    SELECT id, structured_output_ciphertext
    FROM copyright_notice_email_intake_recommendations WHERE id = ${id}`)
  return rows[0] ?? null
}

export async function readCopyrightIntakeAuditReview(id: string): Promise<{
  id: string
  reviewed_at: Date
  decision: string
  rationale_ciphertext: string
} | null> {
  const { rows } = await read<{
    id: string
    reviewed_at: Date
    decision: string
    rationale_ciphertext: string
  }>(sql`/* readCopyrightIntakeAuditReview */
    SELECT id, reviewed_at, decision, rationale_ciphertext
    FROM copyright_notice_email_intake_reviews WHERE id = ${id}`)
  return rows[0] ?? null
}

export async function linkTestCopyrightEmailIntake(
  intakeId: string,
  noticeId: string,
): Promise<void> {
  await write(sql`/* linkTestCopyrightEmailIntake */
    INSERT INTO copyright_notice_email_intake_notice_links
      (copyright_notice_email_intake_id, copyright_notice_id, link_kind)
    VALUES (${intakeId}, ${noticeId}, 'initial')`)
}

export async function seedTestCopyrightAncestorEdge(
  replyIntakeId: string,
  ancestorIntakeId: string,
): Promise<void> {
  await write(sql`/* seedTestCopyrightAncestorEdge */
    INSERT INTO copyright_notice_email_message_ancestors
      (reply_message_intake_receipt_id, ancestor_message_intake_receipt_id, reference_kind)
    VALUES (${replyIntakeId}, ${ancestorIntakeId}, 'in_reply_to')`)
}

export async function readCopyrightThreadReferenceState(intakeId: string): Promise<{
  tokenId: string | null
  referenceCount: number
}> {
  const { rows } = await read<{ token_id: string | null; reference_count: number }>(sql`
    /* readCopyrightThreadReferenceState */ SELECT
      (SELECT token_id FROM copyright_notice_email_thread_references
        WHERE copyright_notice_email_intake_id = ${intakeId} AND token_id IS NOT NULL
        ORDER BY id LIMIT 1) AS token_id,
      (SELECT COUNT(*)::integer FROM copyright_notice_email_thread_references
        WHERE copyright_notice_email_intake_id = ${intakeId}) AS reference_count`)
  return { tokenId: rows[0]!.token_id, referenceCount: rows[0]!.reference_count }
}

export async function seedCopyrightThreadRetirement(
  noticeId: string,
  retiredBeforeIntakeId: string,
): Promise<void> {
  await write(sql`/* seedCopyrightThreadRetirement */
    INSERT INTO copyright_notice_email_thread_retirements
      (copyright_notice_id, retired_before_intake_bound)
    VALUES (${noticeId}, ${retiredBeforeIntakeId}::uuid)`)
}

/** Adds a historical case party after a proof page without adding a lifecycle event. */
export async function seedCopyrightThreadPartySubmission(
  noticeId: string,
  submittedById: string,
): Promise<void> {
  await write(sql`/* seedCopyrightThreadPartySubmission */
    INSERT INTO copyright_notice_submissions
      (copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext)
    VALUES (${noticeId}, ${submittedById}, 'supplement', ${new Date(0)},
      'signed_in_form', ${`v1:backdated-${randomUUID()}`})`)
}
