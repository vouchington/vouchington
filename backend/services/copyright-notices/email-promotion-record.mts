import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import type { PromoteCopyrightEmailIntakeInput } from './email-promotion-input.mts'
import { linkPendingCopyrightEmailRepliesInTransaction } from './email-thread-link-pending.mts'
import type { CopyrightEmailThreadGraph } from './email-thread-graph.mts'
import type { CopyrightEmailIntake } from './email-intakes.mts'
import { copyrightPromotionText, copyrightReceiptText } from './statement-of-reasons-wording.mts'

export function buildEmailNotice(
  input: PromoteCopyrightEmailIntakeInput,
  purpose: string,
  receivedAt: Date,
) {
  return {
    jurisdiction: input.jurisdiction,
    receivedAt,
    claimantUserId: null,
    claimantDisplayName: input.claimantDisplayName,
    claimantContactCiphertext: encryptSecret(input.claimantContact, purpose),
    workDescription: input.workDescription,
    policyVersion: 'copyright-email-moderated-v1',
    targets: input.targets,
    initialSubmission: {
      kind: 'notice' as const,
      sourceKind: 'email' as const,
      bodyCiphertext: encryptSecret(
        JSON.stringify({
          has_good_faith_belief: input.goodFaithBelief,
          has_accuracy_authority_under_penalty_of_perjury:
            input.accuracyAuthorityUnderPenaltyOfPerjury,
          electronic_signature: input.electronicSignature,
        }),
        purpose,
      ),
    },
  }
}

export async function recordEmailPromotion(
  transaction: TransactionQuery,
  intake: CopyrightEmailIntake,
  noticeId: string,
  input: PromoteCopyrightEmailIntakeInput,
  purpose: string,
  graph: CopyrightEmailThreadGraph,
  shouldLinkReplies: boolean,
): Promise<string> {
  const { rows } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:submission */
    SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId}
      AND kind = 'notice' AND source_kind <> 'staff'
  `)
  const submission = rows[0]
  assert(submission, 500, 'Email copyright submission was not created')
  const rationaleCiphertext = encryptSecret(
    JSON.stringify({
      rationale: input.rationale,
      manual_fallback_reason: input.manualFallbackReason,
    }),
    purpose,
  )
  // ast-grep-ignore: no-three-sequential-awaits -- write the receipt before the review's shared receipt guard, then add evidence only after the legal decision is recorded
  const { rows: decisions } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:currentDecision */
    UPDATE copyright_notice_email_intake_receipts SET
      review_decision = 'approved', reviewed_at = CURRENT_TIMESTAMP,
      reviewed_by_id = ${input.currentUser.id},
      review_rationale_ciphertext = ${rationaleCiphertext}
    WHERE id = ${intake.id} AND review_decision IS NULL AND erased_at IS NULL
    RETURNING id`)
  assert(decisions[0], 409, 'Copyright email intake was decided concurrently')
  await transaction(sql`/* promoteCopyrightEmailIntake:review */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_receipt_id, copyright_notice_email_intake_recommendation_id, reviewed_at,
      reviewed_by_id, decision, rationale_ciphertext, promoted_copyright_notice_id
    ) VALUES (${intake.id}, ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id}, 'approved',
      ${rationaleCiphertext}, ${noticeId})
  `)
  await transaction(sql`/* promoteCopyrightEmailIntake:evidence */
    INSERT INTO copyright_notice_evidence_artifacts (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
    VALUES (${submission.id}, ${intake.raw_storage_object_id}, ${intake.raw_sha256}, ${intake.raw_media_type_id}, ${intake.raw_byte_size})
  `)
  const { rows: initialLinks } = await transaction<{ copyright_notice_email_intake_id: string }>(
    sql`/* promoteCopyrightEmailIntake:initialThreadLink */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind
    ) VALUES (${intake.id}, ${noticeId}, 'initial')
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
    RETURNING copyright_notice_email_intake_id
  `,
  )
  assert(initialLinks[0], 409, 'Copyright email intake was linked concurrently')
  if (shouldLinkReplies)
    await linkPendingCopyrightEmailRepliesInTransaction(
      {
        initialIntakeId: intake.id,
        noticeId,
        descendantIntakeIds: graph.descendantIntakeIds.filter(id => id !== intake.id),
        graphIntakeIds: graph.intakeIds,
      },
      transaction,
    )
  const { rows: arrivalReceipt } = await transaction<{
    id: string
  }>(sql`/* recordEmailPromotion:arrivalReceipt */
    SELECT id FROM copyright_notice_delivery_work_items WHERE copyright_notice_email_intake_receipt_id = ${intake.id}
      AND delivery_kind = 'email_intake_received' AND state NOT IN ('failed', 'bounced')
  `)
  const claimantReceipt = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId,
      submissionId: submission.id,
      correspondenceKind: 'receipt',
      bodyText: arrivalReceipt[0]
        ? copyrightPromotionText(noticeId)
        : copyrightReceiptText(noticeId),
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: submission.id,
      correspondenceId: claimantReceipt.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-email-intake:${intake.id}:claimant-receipt`,
      recipientEmail: input.claimantEmail,
    },
    transaction,
  )
  return submission.id
}
