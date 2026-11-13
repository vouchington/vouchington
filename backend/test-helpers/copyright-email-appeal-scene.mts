import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { createTestUser } from './index.mts'
import { createClearScreenedForm } from './services/copyright-notices/screened-form.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { createUnparsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { insertCopyrightEmailIntakeNoticeLink } from '../services/copyright-notices/email-thread-link.mts'
import { insertAdmittedCopyrightEmailSubmission } from '../services/copyright-notices/email-correspondence-admission-submission.mts'
import { recordAdmittedCopyrightCorrespondenceReview } from '../services/copyright-notices/email-correspondence-review.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from '../services/copyright-notices/email-intake-reply.mts'
import { isCopyrightIntakeEnabled } from '../services/copyright-notices/activation.mts'
import { buildCopyrightEmailThreadReferenceRows } from '../services/copyright-notices/email-thread-references.mts'
import {
  resolveCopyrightEmailThreadTokenIds,
  insertResolvedCopyrightEmailThreadReferences,
} from '../services/copyright-notices/email-thread-ancestors.mts'

/** Current screening-backed automatic authority and an unmatched sender's admitted email appeal. */
export async function createOwnedCopyrightEmailAppealScene() {
  const [poster, claimant, moderator] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const { notice, screeningId } = await createClearScreenedForm(1, { claimant, poster })
  const noticeId = notice.intake.copyright_notice_id
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    assessedAt: new Date(),
    currentUser: null,
    substantiallyCompliant: true,
    copyrightFormScreeningId: screeningId,
  })
  const target = (await getCopyrightNoticePrivateAggregate(noticeId))!.targets[0]!
  const restriction = await seedCopyrightStatementRestriction({
    noticeId,
    targetId: target.id,
    assessmentId: assessment.id,
    revision: target.placement_revision,
    moderatorId: moderator.id,
    automated: true,
    reviewed: false,
  })
  const intake = await createUnparsedCopyrightEmailIntake()
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const body = encryptSecret('I created this image.', purpose)
  const messageId = `<${crypto.randomUUID()}@example.test>`
  const admission = {
    currentUser: moderator,
    intakeId: intake.id,
    kind: 'appeal' as const,
    targetIds: [target.id],
    structuredSubmission: { reason: 'I created this image.', targetIds: [target.id] },
    rationale: 'The email completes an appeal of the restricted material.',
    recommendationId: null,
    manualFallbackReason: 'Agent output is unavailable.',
  }
  await using transaction = await beginTransaction()
  await transaction(sql`/* createOwnedCopyrightEmailAppealScene:parse */
    INSERT INTO copyright_notice_email_intake_parses (copyright_notice_email_intake_id, status,
      sender_email_ciphertext, subject_ciphertext, body_ciphertext, message_id_ciphertext)
    VALUES (${intake.id}, 'succeeded', ${encryptSecret('poster@example.test', purpose)},
      ${encryptSecret('Appeal', purpose)}, ${body}, ${encryptSecret(messageId, purpose)})`)
  if (isCopyrightIntakeEnabled())
    await createCopyrightEmailIntakeResponseInTransaction(
      {
        intakeId: intake.id,
        recipientEmail: 'poster@example.test',
        responseKind: 'received',
        responseMessage: null,
      },
      transaction,
    )
  const references = buildCopyrightEmailThreadReferenceRows({
    messageId,
    inReplyTo: [],
    references: [],
  })
  const tokens = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    references.map(row => row.lookup_digest),
  )
  await insertResolvedCopyrightEmailThreadReferences(transaction, intake.id, references, tokens)
  if (
    !(await insertCopyrightEmailIntakeNoticeLink(transaction, {
      intakeId: intake.id,
      noticeId,
      linkKind: 'thread',
    }))
  )
    throw new Error('Owned email appeal was not linked')
  const correspondenceId = uuidv7()
  await transaction(sql`/* createOwnedCopyrightEmailAppealScene:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id, copyright_notice_correspondence_id)
    VALUES (${noticeId}, 'email_correspondence_admitted', ${moderator.id}, ${correspondenceId})`)
  const { submissionId } = await insertAdmittedCopyrightEmailSubmission(
    transaction,
    admission,
    {
      id: intake.id,
      amazon_ses_message_id: intake.amazon_ses_message_id,
      received_at: intake.received_at,
      raw_storage_object_id: intake.raw_storage_object_id,
      raw_sha256: intake.raw_sha256,
      raw_media_type_id: intake.raw_media_type_id,
      raw_byte_size: intake.raw_byte_size,
      notice_id: noticeId,
      body_ciphertext: body,
    },
    correspondenceId,
  )
  await recordAdmittedCopyrightCorrespondenceReview(transaction, {
    input: admission,
    noticeId,
    submissionId,
    correspondenceId,
    rationaleCiphertext: encryptSecret(admission.rationale, purpose),
    manualFallbackCiphertext: encryptSecret(admission.manualFallbackReason, purpose),
  })
  await transaction.commit()
  const input = {
    submissionId,
    currentUser: moderator,
    recommendationId: null,
    manualFallbackReason: 'The record is sufficient without an agent recommendation.',
    rationale: 'The supplied record supports reversal.',
    decisions: [{ restrictionId: restriction.id, action: 'reverse' as const }],
  }
  return {
    noticeId,
    restrictionId: restriction.id,
    targetId: target.id,
    revision: target.placement_revision,
    assessmentId: assessment.id,
    screeningId,
    claimant,
    poster,
    moderator,
    input,
  }
}

export async function readOwnedEmailAppealAuthority(
  scene: Awaited<ReturnType<typeof createOwnedCopyrightEmailAppealScene>>,
) {
  const { rows } = await write<{
    automated: boolean
    screening: string | null
    assessor: string | null
    imposed: string | null
    current: boolean
  }>(sql`/* readOwnedEmailAppealAuthority */
    SELECT restriction.is_authorizing_assessment_automated AS automated,
      assessment.copyright_notice_form_screening_id AS screening, assessment.assessed_by_id AS assessor,
      restriction.imposed_by_id AS imposed,
      submission.current_assessment_identity_id = assessment.id AND
        fn_current_copyright_form_screening(submission.id, assessment.copyright_notice_form_screening_id) AS current
    FROM copyright_restrictions restriction
    JOIN copyright_notice_submission_assessments assessment ON assessment.id = restriction.authorizing_assessment_id
    JOIN copyright_notice_submissions submission ON submission.id = assessment.copyright_notice_submission_id
    WHERE restriction.id = ${scene.restrictionId}`)
  return rows[0]
}
