import { beginTransaction } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from './email-intake-reply.mts'

/**
 * Records a staff rejection or needs-information decision and queues the sender's reply.
 *
 * With a succeeded parse the reply goes to the parsed sender, and a typed `replyEmail` is a 422:
 * the parse may have landed after staff opened the intake, and a silently ignored address would
 * send a legal communication somewhere staff never chose. Without one, the reply goes to the
 * typed `replyEmail`, and with no address nothing is queued. A parse that lands after the decision
 * sends nothing, because a response exists only when this call creates it.
 *
 * `responseId` is set only when this call created the reply, so the caller enqueues its delivery
 * once. `replyQueued` also reports an earlier identical decision's reply on an exact replay.
 */
export async function rejectCopyrightEmailIntake(input: {
  currentUser: PrivateUser
  intakeId: string
  recommendationId: string | null
  manualFallbackReason: string | null
  rationale: string
  replyEmail?: string | null
  responseKind?: 'rejected' | 'needs_information'
  responseMessage?: string | null
}): Promise<{ responseId: string | null; replyQueued: boolean }> {
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
  const replyEmail = input.replyEmail ?? null
  assert(
    replyEmail === null || (replyEmail.length <= 254 && isEmailAddress(replyEmail)),
    422,
    'reply email must be a valid email address',
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
    amazon_ses_message_id: string
    parsed_sender_ciphertext: string | null
  }>(sql`/* rejectCopyrightEmailIntake:lock */
    SELECT intake.amazon_ses_message_id, parse.sender_email_ciphertext AS parsed_sender_ciphertext
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE intake.id = ${input.intakeId}
    FOR UPDATE OF intake
  `)
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  await assertNoInitialIntakeThreadBarrier(transaction, input.intakeId)
  await assertRecommendationScope(transaction, input.recommendationId, input.intakeId)
  const { rows: decisions } = await transaction<{ decision: string; response_id: string | null }>(
    sql`/* rejectCopyrightEmailIntake:existing */
      SELECT review.decision, response.id AS response_id
      FROM copyright_notice_email_intake_reviews review
      LEFT JOIN copyright_notice_delivery_intents response
        ON response.copyright_notice_email_intake_id = review.copyright_notice_email_intake_id
        AND response.delivery_kind IN ('email_intake_rejected', 'email_intake_needs_information')
      WHERE review.copyright_notice_email_intake_id = ${input.intakeId}`,
  )
  const decision = decisions[0]
  assert(decision?.decision !== 'approved', 409, 'Copyright email intake was already approved')
  assert(decision?.decision !== 'legal_process', 409, 'Copyright email intake is legal process')
  if (decision) {
    await transaction.commit()
    return { responseId: null, replyQueued: decision.response_id !== null }
  }
  const parsedSender = intake.parsed_sender_ciphertext
    ? decryptSecret(
        intake.parsed_sender_ciphertext,
        copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
      )
    : null
  assert(
    !(parsedSender && replyEmail),
    422,
    'reply_email is only accepted while the intake has no parsed sender',
  )
  await transaction(sql`/* rejectCopyrightEmailIntake */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id,
      reviewed_at, reviewed_by_id, decision, rationale_ciphertext
    ) VALUES (
      ${input.intakeId}, ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      'rejected', ${encryptSecret(
        JSON.stringify({
          rationale: input.rationale,
          manual_fallback_reason: input.manualFallbackReason,
        }),
        copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
      )}
    )
  `)
  const recipientEmail = parsedSender ?? replyEmail
  const response = recipientEmail
    ? await createCopyrightEmailIntakeResponseInTransaction(
        {
          intakeId: input.intakeId,
          recipientEmail,
          responseKind: input.responseKind ?? 'rejected',
          responseMessage: input.responseMessage ?? null,
        },
        transaction,
      )
    : null
  await transaction.commit()
  return { responseId: response, replyQueued: response !== null }
}

export async function assertNoInitialIntakeThreadBarrier(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  await assertNotUnresolvedThreadReply(transaction, intakeId)
  await assertNoThreadCorrespondenceDecision(transaction, intakeId)
}

async function assertNotUnresolvedThreadReply(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* rejectCopyrightEmailIntake:unresolvedReply */
    SELECT 1 FROM copyright_notice_email_thread_references reference
    WHERE reference.copyright_notice_email_intake_id = ${intakeId}
      AND reference.reference_kind = 'reply_reference'
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = ${intakeId}
          AND link.link_kind = 'thread'
      )
    LIMIT 1
  `)
  assert(!rows[0], 409, 'Unresolved reply email must wait for its root case')
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
