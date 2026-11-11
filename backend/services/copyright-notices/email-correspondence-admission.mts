import { v7 as uuidv7 } from 'uuid'
import { preemptCopyrightRestorations } from './restore-preemption.mts'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { recordClaimantMisuseEvent } from './claimant-misuse-ledger.mts'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './email-erased-key.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import {
  assertNoInitialIntakeReview,
  assertRecommendationOrFallback,
  assertRecommendationScope,
  type CopyrightEmailAppealSubmission,
  type CopyrightEmailCorrespondenceKind,
  type CopyrightEmailCounterNoticeSubmission,
  type CopyrightEmailOtherSubmission,
} from './email-correspondence-guards.mts'
import { insertAdmittedCopyrightEmailSubmission } from './email-correspondence-admission-submission.mts'
import { recordAdmittedCopyrightCorrespondenceReview } from './email-correspondence-review.mts'
import { revokeCopyrightGuestCapabilitiesForWithdrawal } from './guest-capability-withdrawal.mts'

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
  const { rows: notices } = await transaction<{ jurisdiction: string }>(sql`
    /* admitCopyrightEmailCorrespondence:notice */
    SELECT notice.jurisdiction FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notices notice ON notice.id = link.copyright_notice_id
    WHERE link.copyright_notice_email_intake_id = ${input.intakeId} AND link.link_kind = 'thread'
  `)
  assert(notices[0], 404, 'Matched copyright email correspondence not found')
  const { rows } =
    await transaction<PendingCorrespondence>(sql`/* admitCopyrightEmailCorrespondence:pending */
    SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
      COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
      intake.raw_storage_object_id,
      intake.raw_sha256, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size,
      link.copyright_notice_id AS notice_id, parse.body_ciphertext
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id AND link.link_kind = 'thread'
    JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
    WHERE intake.id = ${input.intakeId}
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
    WHERE copyright_notice_email_intake_id = ${input.intakeId}
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
  const { rowCount: pendingDecisions } =
    await transaction(sql`/* admitCopyrightEmailCorrespondence:pendingDecision */
    SELECT id FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${input.intakeId}
      AND correspondence_action = 'pending'
    FOR UPDATE`)
  assert(pendingDecisions === 1, 409, 'Copyright email correspondence was already reviewed')
  const correspondenceId = uuidv7()
  // Keep actual work-item preemption before the event's existing case-clock write.
  if (input.kind === 'court_or_ccb_hold')
    await preemptCopyrightRestorations(pending.notice_id, transaction)
  await transaction(sql`/* admitCopyrightEmailCorrespondence:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_correspondence_id)
    VALUES (${pending.notice_id}, 'email_correspondence_admitted', ${input.currentUser.id}, ${correspondenceId})
  `)
  const { submissionId } = await insertAdmittedCopyrightEmailSubmission(
    transaction,
    input,
    pending,
    correspondenceId,
  )
  const rationaleCiphertext = encryptSecret(
    input.rationale,
    copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
  )
  const manualFallbackCiphertext = input.manualFallbackReason
    ? encryptSecret(
        input.manualFallbackReason,
        copyrightEmailIntakePurpose(pending.amazon_ses_message_id),
      )
    : null
  await recordAdmittedCopyrightCorrespondenceReview(transaction, {
    input,
    noticeId: pending.notice_id,
    submissionId: submissionId,
    correspondenceId: correspondenceId,
    rationaleCiphertext,
    manualFallbackCiphertext,
  })
  if (input.kind === 'withdrawal') {
    await recordClaimantMisuseEvent(transaction, {
      noticeId: pending.notice_id,
      event: { outcome: 'notice_withdrawn', submissionId: submissionId },
    })
    await revokeCopyrightGuestCapabilitiesForWithdrawal(transaction, {
      noticeId: pending.notice_id,
      revokedAt: new Date(),
    })
  }
  await transaction.commit()
  return {
    noticeId: pending.notice_id,
    submissionId: submissionId,
    correspondenceId: correspondenceId,
    isDuplicate: false,
  }
}
