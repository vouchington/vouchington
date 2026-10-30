import { lockCopyrightIntakeCaseLifetimes } from './encryption-intake-lifetimes.mts'
import { openCopyrightSecrets } from './encryption-keys.mts'
import { copyrightCorrespondencePurpose } from './correspondence.mts'
/* oxlint-disable max-lines -- Matched-email decisions share one immutable human-review boundary. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { recordClaimantMisuseEvent } from './claimant-misuse-ledger.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { revokeCopyrightGuestCapabilitiesForWithdrawal } from './guest-capability-withdrawal.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './retention-erasure-spec.mts'
import { v7 as uuidv7 } from 'uuid'
import { createGuestTerritorialComplaintFromEmail } from './territorial-complaint-email.mts'

export type CopyrightEmailCorrespondenceKind =
  | 'supplement'
  | 'appeal'
  | 'counter_notice'
  | 'withdrawal'
  | 'court_or_ccb_hold'
  | 'complaint'

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
    input.kind !== 'complaint' || input.targetIds.length === 0,
    422,
    'Complaints do not name targets',
  )
  assert(
    input.rationale.trim().length > 0 && input.rationale.length <= 10_000,
    422,
    'Review rationale is required',
  )
  await using transaction = await beginTransaction()
  await lockCopyrightIntakeCaseLifetimes(transaction, [input.intakeId])
  // The immutable thread link identifies the parent before any intake lock. Agent
  // completion and retention take that same parent-to-child order.
  const { rows: notices } = await transaction<{ jurisdiction: string }>(sql`
    /* admitCopyrightEmailCorrespondence:lockNotice */
    SELECT notice.jurisdiction FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
    WHERE link.copyright_notice_email_intake_receipt_id = ${input.intakeId} AND link.link_kind = 'thread'
    FOR UPDATE OF notice
  `)
  assert(notices[0], 404, 'Matched copyright email correspondence not found')
  const { rows } =
    await transaction<PendingCorrespondence>(sql`/* admitCopyrightEmailCorrespondence:lock */
    SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
      COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
      intake.raw_storage_object_id,
      intake.raw_sha256, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size,
      link.copyright_notice_id AS notice_id, parse.body_ciphertext
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_receipt_id = intake.id AND link.link_kind = 'thread'
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
    SELECT correspondence_submission_id AS submission_id,
      correspondence_message_id AS correspondence_id,
      correspondence_action AS action
    FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_receipt_id = ${input.intakeId}
      AND correspondence_action IN ('admitted', 'rejected')
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
  assert(
    input.kind === 'complaint'
      ? notices[0]?.jurisdiction === 'eu_dsa'
      : notices[0]?.jurisdiction === 'us_dmca',
    422,
    'Correspondence kind does not apply to this jurisdiction',
  )
  await using caseSecrets = await openCopyrightSecrets(
    { kind: 'notice', id: pending.notice_id },
    transaction,
    'write',
  )
  await using intakeSecrets = await openCopyrightSecrets(
    { kind: 'intake', id: input.intakeId },
    transaction,
    'write',
  )
  const { encryptSecret } = caseSecrets
  const bodyText = intakeSecrets.decryptSecret(
    pending.body_ciphertext,
    copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
  )
  const submissionId = uuidv7()
  const { rows: submissions } = await transaction<{
    id: string
  }>(sql`/* admitCopyrightEmailCorrespondence:submission */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${submissionId}, ${pending.notice_id}, NULL, ${input.kind}::copyright_notice_submission_kinds, ${pending.received_at}, 'email',
      ${encryptSecret(JSON.stringify(input.structuredSubmission), copyrightSubmissionPurpose(submissionId))}
    ) RETURNING id
  `)
  const submission = submissions[0]
  assert(submission, 500, 'Failed to record copyright email submission')
  if (input.kind === 'complaint')
    await createGuestTerritorialComplaintFromEmail(
      {
        noticeId: pending.notice_id,
        submissionId: submission.id,
        receivedAt: pending.received_at,
        bodyText,
      },
      transaction,
    )
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
      copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size
    ) VALUES (${submission.id}, ${pending.raw_storage_object_id}, ${pending.raw_sha256}, ${pending.raw_media_type_id}, ${pending.raw_byte_size})
  `)
  const correspondenceId = uuidv7()
  const { rows: correspondenceRows } = await transaction<{
    id: string
  }>(sql`/* admitCopyrightEmailCorrespondence:correspondence */
    INSERT INTO copyright_notice_correspondence_messages (
      id, copyright_notice_id, copyright_notice_submission_id, copyright_notice_email_intake_id,
      direction, composition_kind, correspondence_kind, body_ciphertext
    ) VALUES (${correspondenceId}, ${pending.notice_id}, ${submission.id}, ${input.intakeId}, 'inbound', 'inbound', 'inbound_message', ${caseSecrets.encryptSecret(bodyText, copyrightCorrespondencePurpose(correspondenceId))})
    RETURNING id
  `)
  const correspondence = correspondenceRows[0]
  assert(correspondence, 500, 'Failed to record copyright email correspondence')
  const rationaleCiphertext = caseSecrets.encryptSecret(
    input.rationale,
    copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
  )
  const manualFallbackCiphertext = input.manualFallbackReason
    ? caseSecrets.encryptSecret(
        input.manualFallbackReason,
        copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
      )
    : null
  await recordAdmittedCopyrightCorrespondenceReview(transaction, {
    input,
    noticeId: pending.notice_id,
    submissionId: submission.id,
    correspondenceId: correspondence.id,
    rationaleCiphertext,
    manualFallbackCiphertext,
  })
  await transaction(sql`/* admitCopyrightEmailCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_correspondence_id)
    VALUES (${pending.notice_id}, 'email_correspondence_admitted', ${input.currentUser.id}, ${correspondence.id})
  `)
  if (input.kind === 'withdrawal') {
    await recordClaimantMisuseEvent(transaction, {
      noticeId: pending.notice_id,
      event: { outcome: 'notice_withdrawn', submissionId: submission.id },
    })
    await revokeCopyrightGuestCapabilitiesForWithdrawal(transaction, {
      noticeId: pending.notice_id,
      revokedAt: new Date(),
    })
  }
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
  // Rejection also writes case-linked review/event rows; fence retention before
  // locking the intake rather than obtaining the parent FK lock afterward.
  const { rows: notices } = await transaction<{ id: string }>(sql`
    /* rejectCopyrightEmailCorrespondence:lockNotice */
    SELECT notice.id FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
    WHERE link.copyright_notice_email_intake_receipt_id = ${input.intakeId} AND link.link_kind = 'thread'
    FOR UPDATE OF notice
  `)
  assert(notices[0], 404, 'Matched copyright email correspondence not found')
  const { rows } = await transaction<{
    notice_id: string
    amazon_ses_message_id: string
  }>(sql`/* rejectCopyrightEmailCorrespondence:lock */
    SELECT link.copyright_notice_id AS notice_id, intake.amazon_ses_message_id
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_receipt_id = intake.id AND link.link_kind = 'thread'
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
    SELECT correspondence_action AS action FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_receipt_id = ${input.intakeId}
      AND correspondence_action IN ('admitted', 'rejected')
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
  await using caseSecrets = await openCopyrightSecrets(
    { kind: 'notice', id: pending.notice_id },
    transaction,
    'write',
  )
  const rationaleCiphertext = caseSecrets.encryptSecret(
    input.rationale,
    copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
  )
  const manualFallbackCiphertext = input.manualFallbackReason
    ? caseSecrets.encryptSecret(
        input.manualFallbackReason,
        copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
      )
    : null
  await recordRejectedCopyrightCorrespondenceDecision(transaction, {
    input,
    noticeId: pending.notice_id,
    rationaleCiphertext,
    manualFallbackCiphertext,
  })
  await transaction.commit()
  return { noticeId: pending.notice_id, isDuplicate: false }
}

async function assertNoInitialIntakeReview(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
): Promise<void> {
  const { rows } = await transaction(sql`/* copyrightEmailIntake:noInitialReview */
    SELECT 1 FROM copyright_notice_email_intake_receipts
    WHERE id = ${intakeId} AND review_decision IS NOT NULL
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
    SELECT id FROM copyright_notice_email_intake_recommendation_identities
    WHERE id = ${recommendationId} AND copyright_notice_email_intake_receipt_id = ${intakeId}
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
  amazon_ses_message_id: string
  received_at: Date
  raw_storage_key: string
  raw_storage_object_id: string | null
  raw_sha256: Buffer
  raw_media_type_id: string
  raw_mime_type: string
  raw_byte_size: number
  notice_id: string
  body_ciphertext: string
}

type AdmittedCorrespondence = {
  submission_id: string
  correspondence_id: string
}

/** Keep the finite review and the link's durable final result in one transaction step. */
async function recordAdmittedCopyrightCorrespondenceReview(
  transaction: TransactionQuery,
  result: {
    input: Parameters<typeof admitCopyrightEmailCorrespondence>[0]
    noticeId: string
    submissionId: string
    correspondenceId: string
    rationaleCiphertext: string
    manualFallbackCiphertext: string | null
  },
): Promise<void> {
  const {
    input,
    noticeId,
    submissionId,
    correspondenceId,
    rationaleCiphertext,
    manualFallbackCiphertext,
  } = result
  await transaction(sql`/* admitCopyrightEmailCorrespondence:review */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action, kind,
      copyright_notice_email_intake_recommendation_id,
      copyright_notice_submission_id, copyright_notice_correspondence_message_id,
      reviewed_at, reviewed_by_id, rationale_ciphertext, manual_fallback_reason_ciphertext
    ) VALUES (
      ${input.intakeId}, ${noticeId}, 'admitted', ${input.kind}::copyright_notice_email_correspondence_review_kinds, ${input.recommendationId}, ${submissionId},
      ${correspondenceId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      ${rationaleCiphertext},
      ${manualFallbackCiphertext}
    )
  `)
  await transaction(sql`/* admitCopyrightEmailCorrespondence:currentDecision */
    UPDATE copyright_notice_email_intake_notice_links SET
      correspondence_action = 'admitted', correspondence_kind = ${input.kind},
      correspondence_submission_id = ${submissionId},
      correspondence_message_id = ${correspondenceId},
      correspondence_reviewed_at = CURRENT_TIMESTAMP,
      correspondence_reviewed_by_id = ${input.currentUser.id},
      correspondence_rationale_ciphertext = ${rationaleCiphertext},
      correspondence_manual_fallback_reason_ciphertext = ${manualFallbackCiphertext}
    WHERE copyright_notice_email_intake_receipt_id = ${input.intakeId}`)
}

/** A rejected link also owns its final review result after finite review history expires. */
async function recordRejectedCopyrightCorrespondenceReview(
  transaction: TransactionQuery,
  result: {
    input: Parameters<typeof rejectCopyrightEmailCorrespondence>[0]
    noticeId: string
    rationaleCiphertext: string
    manualFallbackCiphertext: string | null
  },
): Promise<void> {
  const { input, noticeId, rationaleCiphertext, manualFallbackCiphertext } = result
  await transaction(sql`/* rejectCopyrightEmailCorrespondence */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action, kind,
      copyright_notice_email_intake_recommendation_id, reviewed_at, reviewed_by_id,
      rationale_ciphertext, manual_fallback_reason_ciphertext
    ) VALUES (${input.intakeId}, ${noticeId}, 'rejected', ${input.kind}::copyright_notice_email_correspondence_review_kinds,
      ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      ${rationaleCiphertext},
      ${manualFallbackCiphertext})
  `)
  await transaction(sql`/* rejectCopyrightEmailCorrespondence:currentDecision */
    UPDATE copyright_notice_email_intake_notice_links SET
      correspondence_action = 'rejected', correspondence_kind = ${input.kind},
      correspondence_reviewed_at = CURRENT_TIMESTAMP,
      correspondence_reviewed_by_id = ${input.currentUser.id},
      correspondence_rationale_ciphertext = ${rationaleCiphertext},
      correspondence_manual_fallback_reason_ciphertext = ${manualFallbackCiphertext}
    WHERE copyright_notice_email_intake_receipt_id = ${input.intakeId}`)
}

/** The final link/history result and its case activity event commit together. */
async function recordRejectedCopyrightCorrespondenceDecision(
  transaction: TransactionQuery,
  result: Parameters<typeof recordRejectedCopyrightCorrespondenceReview>[1],
): Promise<void> {
  await recordRejectedCopyrightCorrespondenceReview(transaction, result)
  await transaction(sql`/* rejectCopyrightEmailCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_email_intake_id)
    VALUES (${result.noticeId}, 'email_correspondence_rejected',
      ${result.input.currentUser.id}, ${result.input.intakeId})
  `)
}
