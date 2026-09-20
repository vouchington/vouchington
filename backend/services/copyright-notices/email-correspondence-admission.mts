/* oxlint-disable max-lines -- Matched-email decisions share one immutable human-review boundary. */
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { v7 as uuidv7 } from 'uuid'

export type CopyrightEmailCorrespondenceKind =
  | 'supplement'
  | 'appeal'
  | 'counter_notice'
  | 'withdrawal'
  | 'court_or_ccb_hold'

type CopyrightEmailAppealSubmission = {
  reason: string
  targetIds: string[]
}

type CopyrightEmailCounterNoticeSubmission = {
  name: string
  address: string
  telephone: string
  consentToFederalJurisdiction: boolean
  consentToServiceOfProcess: boolean
  goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
  electronicSignature: string
  targetIds: string[]
}

type CopyrightEmailOtherSubmission = {
  summary: string
}

export async function admitCopyrightEmailCorrespondence(input: {
  currentUser: PrivateUser
  intakeId: string
  kind: CopyrightEmailCorrespondenceKind
  targetIds: string[]
  structuredSubmission:
    | CopyrightEmailAppealSubmission
    | CopyrightEmailCounterNoticeSubmission
    | CopyrightEmailOtherSubmission
  rationale: string
  recommendationId: string | null
  manualFallbackReason: string | null
}): Promise<{
  noticeId: string
  submissionId: string
  correspondenceId: string
  isDuplicate: boolean
}> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertRecommendationOrFallback(input.recommendationId, input.manualFallbackReason)
  assert(
    (input.kind !== 'appeal' && input.kind !== 'counter_notice') || input.targetIds.length > 0,
    422,
    'Appeals and counter-notices require at least one target',
  )
  assert(
    input.rationale.trim().length > 0 && input.rationale.length <= 10_000,
    422,
    'Review rationale is required',
  )
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<PendingCorrespondence>(sql`/* admitCopyrightEmailCorrespondence:lock */
    SELECT intake.id, intake.ses_message_id, intake.received_at, intake.raw_storage_key,
      intake.raw_sha256, intake.raw_mime_type, intake.raw_byte_size,
      link.copyright_notice_id AS notice_id, parse.body_ciphertext
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id AND link.link_kind = 'thread'
    JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE intake.id = ${input.intakeId}
    FOR UPDATE OF intake
  `)
  const pending = rows[0]
  assert(pending, 404, 'Matched copyright email correspondence not found')
  await assertNoInitialIntakeReview(transaction, input.intakeId)
  await assertRecommendationScope(transaction, input.intakeId, input.recommendationId)
  const { rows: admittedRows } = await transaction<
    AdmittedCorrespondence & { action: 'admitted' | 'rejected' }
  >(sql`/* admitCopyrightEmailCorrespondence:existing */
    SELECT copyright_notice_submission_id AS submission_id,
      copyright_notice_correspondence_id AS correspondence_id, action
    FROM copyright_notice_email_correspondence_reviews
    WHERE copyright_notice_email_intake_id = ${input.intakeId} AND action IN ('admitted', 'rejected')
  `)
  const prior = admittedRows[0]
  if (prior) {
    assert(prior.action === 'admitted', 409, 'Copyright email correspondence was already rejected')
    await transaction.commit()
    return {
      noticeId: pending.notice_id,
      submissionId: prior.submission_id,
      correspondenceId: prior.correspondence_id,
      isDuplicate: true,
    }
  }
  const submissionId = uuidv7()
  const { rows: submissions } = await transaction<{
    id: string
  }>(sql`/* admitCopyrightEmailCorrespondence:submission */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, submitted_by_user_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${submissionId}, ${pending.notice_id}, NULL, ${input.kind}::text, ${pending.received_at}, 'email',
      ${encryptSecret(JSON.stringify(input.structuredSubmission), copyrightSubmissionPurpose(submissionId))}
    ) RETURNING id
  `)
  const submission = submissions[0]
  assert(submission, 500, 'Failed to record copyright email submission')
  if (input.targetIds.length > 0) {
    const { rows: targetRows } =
      await transaction(sql`/* admitCopyrightEmailCorrespondence:targets */
      INSERT INTO copyright_notice_submission_targets (
        copyright_notice_submission_id, copyright_notice_target_id
      ) SELECT ${submission.id}, target.id
      FROM copyright_notice_targets target
      WHERE target.copyright_notice_id = ${pending.notice_id}
        AND target.id = ANY(${input.targetIds}::uuid[])
      RETURNING copyright_notice_target_id
    `)
    assert(
      targetRows.length === input.targetIds.length,
      422,
      'Correspondence target is not in this case',
    )
  }
  await transaction(sql`/* admitCopyrightEmailCorrespondence:evidence */
    INSERT INTO copyright_notice_evidence_artifacts (
      copyright_notice_submission_id, storage_key, sha256, mime_type, byte_size
    ) VALUES (${submission.id}, ${pending.raw_storage_key}, ${pending.raw_sha256}, ${pending.raw_mime_type}, ${pending.raw_byte_size})
  `)
  const { rows: correspondenceRows } = await transaction<{
    id: string
  }>(sql`/* admitCopyrightEmailCorrespondence:correspondence */
    INSERT INTO copyright_notice_correspondence_messages (
      copyright_notice_id, copyright_notice_submission_id, copyright_notice_email_intake_id,
      direction, composition_kind, correspondence_kind, body_ciphertext
    ) VALUES (${pending.notice_id}, ${submission.id}, ${input.intakeId}, 'inbound', 'inbound', 'inbound_message', ${pending.body_ciphertext})
    RETURNING id
  `)
  const correspondence = correspondenceRows[0]
  assert(correspondence, 500, 'Failed to record copyright email correspondence')
  await transaction(sql`/* admitCopyrightEmailCorrespondence:review */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action, kind,
      copyright_notice_email_intake_recommendation_id,
      copyright_notice_submission_id, copyright_notice_correspondence_id,
      reviewed_at, reviewed_by_id, rationale_ciphertext, manual_fallback_reason_ciphertext
    ) VALUES (
      ${input.intakeId}, ${pending.notice_id}, 'admitted', ${input.kind}::text, ${input.recommendationId}, ${submission.id},
      ${correspondence.id}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      ${encryptSecret(input.rationale, copyrightEmailIntakePurpose(pending.ses_message_id))},
      ${input.manualFallbackReason ? encryptSecret(input.manualFallbackReason, copyrightEmailIntakePurpose(pending.ses_message_id)) : null}
    )
  `)
  await transaction(sql`/* admitCopyrightEmailCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${pending.notice_id}, 'email_correspondence_admitted', ${input.currentUser.id},
      jsonb_build_object('submission_id', ${submission.id}::uuid, 'correspondence_id', ${correspondence.id}::uuid))
  `)
  await transaction.commit()
  return {
    noticeId: pending.notice_id,
    submissionId: submission.id,
    correspondenceId: correspondence.id,
    isDuplicate: false,
  }
}

export async function rejectCopyrightEmailCorrespondence(input: {
  currentUser: PrivateUser
  intakeId: string
  kind: CopyrightEmailCorrespondenceKind
  targetIds?: string[]
  rationale: string
  recommendationId: string | null
  manualFallbackReason: string | null
}): Promise<{ noticeId: string; isDuplicate: boolean }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(
    input.rationale.trim().length > 0 && input.rationale.length <= 10_000,
    422,
    'Review rationale is required',
  )
  assertRecommendationOrFallback(input.recommendationId, input.manualFallbackReason)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    notice_id: string
    ses_message_id: string
  }>(sql`/* rejectCopyrightEmailCorrespondence:lock */
    SELECT link.copyright_notice_id AS notice_id, intake.ses_message_id
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id AND link.link_kind = 'thread'
    WHERE intake.id = ${input.intakeId}
    FOR UPDATE OF intake
  `)
  const pending = rows[0]
  assert(pending, 404, 'Matched copyright email correspondence not found')
  await assertNoInitialIntakeReview(transaction, input.intakeId)
  await assertRecommendationScope(transaction, input.intakeId, input.recommendationId)
  const { rows: existingRows } = await transaction<{
    action: 'admitted' | 'rejected'
  }>(sql`/* rejectCopyrightEmailCorrespondence:existing */
    SELECT action FROM copyright_notice_email_correspondence_reviews
    WHERE copyright_notice_email_intake_id = ${input.intakeId} AND action IN ('admitted', 'rejected')
  `)
  if (existingRows[0]) {
    assert(
      existingRows[0].action === 'rejected',
      409,
      'Copyright email correspondence was already admitted',
    )
    await transaction.commit()
    return { noticeId: pending.notice_id, isDuplicate: true }
  }
  await transaction(sql`/* rejectCopyrightEmailCorrespondence */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action, kind,
      copyright_notice_email_intake_recommendation_id, reviewed_at, reviewed_by_id,
      rationale_ciphertext, manual_fallback_reason_ciphertext
    ) VALUES (${input.intakeId}, ${pending.notice_id}, 'rejected', ${input.kind}::text,
      ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      ${encryptSecret(input.rationale, copyrightEmailIntakePurpose(pending.ses_message_id))},
      ${input.manualFallbackReason ? encryptSecret(input.manualFallbackReason, copyrightEmailIntakePurpose(pending.ses_message_id)) : null})
  `)
  await transaction(sql`/* rejectCopyrightEmailCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${pending.notice_id}, 'email_correspondence_rejected', ${input.currentUser.id},
      jsonb_build_object('intake_id', ${input.intakeId}))
  `)
  await transaction.commit()
  return { noticeId: pending.notice_id, isDuplicate: false }
}

async function assertNoInitialIntakeReview(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* copyrightEmailIntake:noInitialReview */
    SELECT 1 FROM copyright_notice_email_intake_reviews
    WHERE copyright_notice_email_intake_id = ${intakeId}
  `)
  assert(!rows[0], 409, 'Thread-linked copyright email cannot receive an initial intake review')
}

async function assertRecommendationScope(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
  recommendationId: string | null,
): Promise<void> {
  if (!recommendationId) return
  const { rows } = await transaction(sql`/* reviewCopyrightEmailCorrespondence:recommendation */
    SELECT id FROM copyright_notice_email_intake_recommendations
    WHERE id = ${recommendationId} AND copyright_notice_email_intake_id = ${intakeId}
  `)
  assert(rows[0], 422, 'Email recommendation does not belong to this intake')
}

function assertRecommendationOrFallback(
  recommendationId: string | null,
  manualFallbackReason: string | null,
): void {
  assert(
    (recommendationId === null) !== (manualFallbackReason === null),
    422,
    'Provide either recommendation_id or manual_fallback_reason',
  )
  if (manualFallbackReason !== null)
    assert(
      manualFallbackReason.trim() && manualFallbackReason.length <= 10_000,
      422,
      'Invalid manual fallback reason',
    )
}

type PendingCorrespondence = {
  id: string
  ses_message_id: string
  received_at: Date
  raw_storage_key: string
  raw_sha256: Buffer
  raw_mime_type: string
  raw_byte_size: number
  notice_id: string
  body_ciphertext: string
}

type AdmittedCorrespondence = {
  submission_id: string
  correspondence_id: string
}
