import { beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getOrCreateEmailAssessment } from './email-assessment.mts'
import { createCopyrightNoticeAggregateInTransaction } from './create.mts'
import { copyrightEmailIntakePurpose, type CopyrightEmailIntake } from './email-intakes.mts'
import {
  assertStatutoryEmailFields,
  type PromoteCopyrightEmailIntakeInput,
} from './email-promotion-input.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

export type { PromoteCopyrightEmailIntakeInput } from './email-promotion-input.mts'

/** A moderator supplies the declarations; advisory extraction is retained only as provenance. */
export async function promoteCopyrightEmailIntake(
  input: PromoteCopyrightEmailIntakeInput,
): Promise<{ noticeId: string; submissionId: string }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertStatutoryEmailFields(input)
  const admitted = await admitCopyrightEmailIntake(input)
  const assessment = await getOrCreateEmailAssessment(input.currentUser, admitted)
  const { rows: targets } = await write<{
    id: string
  }>(sql`/* promoteCopyrightEmailIntake:targets */
    SELECT target.id FROM copyright_notice_targets target
    WHERE target.copyright_notice_id = ${admitted.noticeId}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_restrictions restriction
        WHERE restriction.copyright_notice_target_id = target.id AND restriction.lifted_at IS NULL
      )
  `)
  await Promise.all(
    targets.map(target =>
      acceptCopyrightNoticeAndImposeRestriction({
        noticeId: admitted.noticeId,
        targetId: target.id,
        assessmentId: assessment.id,
        imposedAt: new Date(),
        imposedById: input.currentUser.id,
      }),
    ),
  )
  return admitted
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
  return submission.id
}
