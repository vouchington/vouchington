/* oxlint-disable max-lines -- Email admission keeps evidence, provenance, threading, and delivery atomic. */
import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getOrCreateEmailAssessment } from './email-assessment.mts'
import { createCopyrightNoticeAggregateInTransaction } from './create.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { copyrightEmailIntakePurpose, type CopyrightEmailIntake } from './email-intakes.mts'
import { linkPendingCopyrightEmailRepliesInTransaction } from './email-threading.mts'
import {
  assertStatutoryEmailFields,
  type PromoteCopyrightEmailIntakeInput,
} from './email-promotion-input.mts'
import { processCopyrightEnforcementRequest } from './enforcement-requests.mts'

export type { PromoteCopyrightEmailIntakeInput } from './email-promotion-input.mts'

/** A moderator supplies the declarations; advisory extraction is retained only as provenance. */
export async function promoteCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
): Promise<{ noticeId: string; submissionId: string }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertStatutoryEmailFields(input)
  const admitted = await admitCopyrightEmailIntake(input)
  await assessAndEnforceCopyrightEmailIntake(input, admitted)
  return admitted
}

async function assessAndEnforceCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
  admitted: { noticeId: string; submissionId: string },
): Promise<void> {
  const assessment = await getOrCreateEmailAssessment(input.currentUser, admitted)
  await processCopyrightEnforcementRequest(assessment.id)
}

async function admitCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
): Promise<{ noticeId: string; submissionId: string }> {
  await using transaction = await beginTransaction()
  const { rows: intakeRows } =
    await transaction<CopyrightEmailIntake>(sql`/* promoteCopyrightEmailIntake:lock */
    SELECT id, ses_message_id, received_at, raw_storage_key, raw_sha256, raw_mime_type, raw_byte_size
    FROM copyright_notice_email_intakes WHERE id = ${input.intakeId} FOR UPDATE
  `)
  const intake = intakeRows[0]
  assert(intake, 404, 'Copyright email intake not found')
  await assertNotUnresolvedThreadReply(transaction, intake.id)
  await assertNoThreadCorrespondenceDecision(transaction, intake.id)
  const { rows: priorPromotions } = await transaction<{
    accepted: boolean
    promoted_copyright_notice_id: string | null
    submission_id: string | null
  }>(
    sql`/* promoteCopyrightEmailIntake:priorPromotion */
      SELECT review.accepted, review.promoted_copyright_notice_id, submission.id AS submission_id
      FROM copyright_notice_email_intake_reviews review
      LEFT JOIN copyright_notice_submissions submission
        ON submission.copyright_notice_id = review.promoted_copyright_notice_id
        AND submission.kind = 'notice'
      WHERE copyright_notice_email_intake_id = ${intake.id}
    `,
  )
  const prior = priorPromotions[0]
  if (prior) {
    assert(
      prior.accepted && prior.promoted_copyright_notice_id && prior.submission_id,
      409,
      'Copyright email intake was already rejected',
    )
    // ast-grep-ignore: no-three-sequential-awaits -- the case link and reply backfill must commit before returning an idempotent promotion.
    await transaction(sql`/* promoteCopyrightEmailIntake:initialThreadLink */
      INSERT INTO copyright_notice_email_intake_notice_links (
        copyright_notice_email_intake_id, copyright_notice_id, link_kind
      ) VALUES (${intake.id}, ${prior.promoted_copyright_notice_id}, 'initial')
      ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
    `)
    await linkPendingCopyrightEmailRepliesInTransaction(
      { initialIntakeId: intake.id, noticeId: prior.promoted_copyright_notice_id },
      transaction,
    )
    await transaction.commit()
    return {
      noticeId: prior.promoted_copyright_notice_id,
      submissionId: prior.submission_id,
    }
  }
  await assertRecommendationScope(transaction, input.recommendationId, intake.id)
  const purpose = copyrightEmailIntakePurpose(intake.ses_message_id)
  const notice = await createCopyrightNoticeAggregateInTransaction(
    buildEmailNotice(input, purpose, intake.received_at),
    transaction,
  )
  const submissionId = await recordEmailPromotion(transaction, intake, notice.id, input, purpose)
  await transaction.commit()
  return { noticeId: notice.id, submissionId }
}

async function assertNotUnresolvedThreadReply(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* promoteCopyrightEmailIntake:unresolvedReply */
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
  const { rows } = await transaction(sql`/* promoteCopyrightEmailIntake:threadReview */
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
  assert(!rows[0], 409, 'Thread-linked copyright email cannot be approved as an initial intake')
}

async function assertRecommendationScope(
  transaction: TransactionQuery,
  recommendationId: string | null,
  intakeId: string,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:recommendation */
    SELECT id FROM copyright_notice_email_intake_recommendations
    WHERE id = ${recommendationId} AND copyright_notice_email_intake_id = ${intakeId}
  `)
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}

function buildEmailNotice(
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
          good_faith_belief: input.goodFaithBelief,
          accuracy_authority_under_penalty_of_perjury: input.accuracyAuthorityUnderPenaltyOfPerjury,
          electronic_signature: input.electronicSignature,
        }),
        purpose,
      ),
    },
  }
}

async function recordEmailPromotion(
  transaction: TransactionQuery,
  intake: CopyrightEmailIntake,
  noticeId: string,
  input: PromoteCopyrightEmailIntakeInput,
  purpose: string,
): Promise<string> {
  const { rows } = await transaction<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:submission */
    SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId} AND kind = 'notice'
  `)
  const submission = rows[0]
  assert(submission, 500, 'Email copyright submission was not created')
  // ast-grep-ignore: no-three-sequential-awaits -- immutable evidence, human review, thread linking, and delivery obligations are ordered in one transaction.
  await transaction(sql`/* promoteCopyrightEmailIntake:evidence */
    INSERT INTO copyright_notice_evidence_artifacts (copyright_notice_submission_id, storage_key, sha256, mime_type, byte_size)
    VALUES (${submission.id}, ${intake.raw_storage_key}, ${intake.raw_sha256}, ${intake.raw_mime_type}, ${intake.raw_byte_size})
  `)
  await transaction(sql`/* promoteCopyrightEmailIntake:review */
    INSERT INTO copyright_notice_email_intake_reviews (
      copyright_notice_email_intake_id, copyright_notice_email_intake_recommendation_id, reviewed_at,
      reviewed_by_id, accepted, rationale_ciphertext, promoted_copyright_notice_id
    ) VALUES (${intake.id}, ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id}, true,
      ${encryptSecret(
        JSON.stringify({
          rationale: input.rationale,
          manual_fallback_reason: input.manualFallbackReason,
        }),
        purpose,
      )}, ${noticeId})
  `)
  await transaction(sql`/* promoteCopyrightEmailIntake:initialThreadLink */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind
    ) VALUES (${intake.id}, ${noticeId}, 'initial')
    ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
  `)
  await linkPendingCopyrightEmailRepliesInTransaction(
    { initialIntakeId: intake.id, noticeId },
    transaction,
  )
  const claimantReceipt = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId,
      submissionId: submission.id,
      correspondenceKind: 'receipt',
      bodyText: `We received your copyright notice for case ${noticeId}. We will review it and contact you if we need more information.`,
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
