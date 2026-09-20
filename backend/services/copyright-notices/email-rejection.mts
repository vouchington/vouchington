import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from './email-intake-responses.mts'

export async function rejectCopyrightEmailIntake(input: {
  currentUser: PrivateUser
  intakeId: string
  recommendationId: string | null
  manualFallbackReason: string | null
  rationale: string
  responseKind?: 'rejected' | 'needs_information'
  responseMessage?: string | null
}): Promise<{ responseId: string | null }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim(), 422, 'Email intake review rationale is required')
  assert(
    input.responseKind !== 'needs_information' || Boolean(input.responseMessage?.trim()),
    422,
    'Needs-information responses require a response message',
  )
  assert(
    !input.responseMessage || input.responseMessage.length <= 10_000,
    422,
    'Invalid response message',
  )
  assert(
    (input.recommendationId === null) !== (input.manualFallbackReason === null),
    422,
    'Provide either recommendation_id or manual_fallback_reason',
  )
  if (input.manualFallbackReason !== null)
    assert(
      input.manualFallbackReason.trim() && input.manualFallbackReason.length <= 10_000,
      422,
      'Invalid manual fallback reason',
    )
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    ses_message_id: string
    sender_email_ciphertext: string | null
  }>(sql`/* rejectCopyrightEmailIntake:lock */
    SELECT intake.ses_message_id, parse.sender_email_ciphertext
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE intake.id = ${input.intakeId}
    FOR UPDATE OF intake
  `)
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  await assertNoThreadCorrespondenceDecision(transaction, input.intakeId)
  await assertRecommendationScope(transaction, input.recommendationId, input.intakeId)
  const { rows: decisions } = await transaction<{ accepted: boolean }>(
    sql`/* rejectCopyrightEmailIntake:existing */
      SELECT accepted FROM copyright_notice_email_intake_reviews
      WHERE copyright_notice_email_intake_id = ${input.intakeId}`,
  )
  assert(!decisions[0]?.accepted, 409, 'Copyright email intake was already approved')
  let responseId: string | null = null
  if (!decisions[0]) {
    await transaction(sql`/* rejectCopyrightEmailIntake */
      INSERT INTO copyright_notice_email_intake_reviews (
        copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id,
        reviewed_at, reviewed_by_id, accepted, rationale_ciphertext
      ) VALUES (
        ${input.intakeId}, ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
        false, ${encryptSecret(
          JSON.stringify({
            rationale: input.rationale,
            manual_fallback_reason: input.manualFallbackReason,
          }),
          copyrightEmailIntakePurpose(intake.ses_message_id),
        )}
      )
    `)
    if (intake.sender_email_ciphertext) {
      const response = await createCopyrightEmailIntakeResponseInTransaction(
        {
          intakeId: input.intakeId,
          intakeSesMessageId: intake.ses_message_id,
          senderEmailCiphertext: intake.sender_email_ciphertext,
          responseKind: input.responseKind ?? 'rejected',
          responseMessage: input.responseMessage ?? null,
        },
        transaction,
      )
      responseId = response.id
    }
  }
  await transaction.commit()
  return { responseId }
}

async function assertNoThreadCorrespondenceDecision(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* rejectCopyrightEmailIntake:threadReview */
    SELECT 1
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_email_intake_id = ${intakeId}
      AND link.link_kind = 'thread'
    UNION ALL
    SELECT 1
    FROM copyright_notice_email_correspondence_reviews review
    WHERE review.copyright_notice_email_intake_id = ${intakeId}
      AND review.action IN ('admitted', 'rejected')
    LIMIT 1
  `)
  assert(!rows[0], 409, 'Thread-linked copyright email cannot be rejected as an initial intake')
}

async function assertRecommendationScope(
  transaction: TransactionQuery,
  recommendationId: string | null,
  intakeId: string,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction<{ id: string }>(
    sql`/* rejectCopyrightEmailIntake:recommendation */
      SELECT id FROM copyright_notice_email_intake_recommendations
      WHERE id = ${recommendationId} AND copyright_notice_email_intake_id = ${intakeId}`,
  )
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}
