import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createUnparsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { appendCopyrightEmailIntakeRecommendation } from '../services/copyright-notices/email-recommendations.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { createCopyrightFormFixture } from './copyright-route-fixtures.mts'
import { createTestUser, getTestPostImagePlacement } from './index.mts'
/** Body contracts need an already parsed receipt, not a competing threading transaction. */
export async function createCopyrightApiParsedIntake() {
  const intake = await createUnparsedCopyrightEmailIntake()
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  await write(sql`/* createCopyrightApiParsedIntake */
    INSERT INTO copyright_notice_email_intake_parses (
      copyright_notice_email_intake_id, status, sender_email_ciphertext,
      subject_ciphertext, body_ciphertext
    ) VALUES (${intake.id}, 'succeeded', ${encryptSecret('claimant@example.test', purpose)},
      ${encryptSecret('Copyright complaint', purpose)}, ${encryptSecret('Copyright complaint.', purpose)})`)
  return intake
}

export async function createCopyrightApiRecommendedIntake(
  structuredOutput: Record<string, unknown>,
) {
  const intake = await createCopyrightApiParsedIntake()
  await appendCopyrightEmailIntakeRecommendation({
    intakeId: intake.id,
    inputSha256: Buffer.alloc(32, 8),
    promptVersion: 'copyright-api-contract',
    model: 'synthetic-test-model',
    structuredOutput,
  })
  return intake
}

/** Establish an already committed staff decision before testing its sequential rejection. */
export async function seedCopyrightApiManualAssociation(intakeId: string, noticeId: string) {
  const reviewer = await createTestUser({ extraRoles: ['moderator'] })
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightApiManualAssociation:link */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind, correspondence_action
    ) VALUES (${intakeId}, ${noticeId}, 'thread', 'pending')`)
  await transaction(sql`/* seedCopyrightApiManualAssociation:event */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, copyright_notice_email_intake_id, changed_by_id
    ) VALUES (${noticeId}, 'email_intake_manually_associated', ${intakeId}, ${reviewer.id})`)
  await transaction.commit()
}

export async function createCopyrightApiNotice(
  fixture: Awaited<ReturnType<typeof createCopyrightFormFixture>>,
) {
  const target = fixture.form.targets[0]!
  const placement = await getTestPostImagePlacement(target.post_id, target.image_id)
  if (!placement) throw new Error('Owned hosted image placement disappeared')
  // Admission is setup here; exercise only the appeal/counter-notice request below.
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: fixture.claimant.id,
    claimantDisplayName: 'Copyright claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: 'A photograph owned by the claimant.',
    policyVersion: 'test-v1',
    initialSubmission: { kind: 'notice', sourceKind: 'signed_in_form', bodyCiphertext: 'fixture' },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId: target.image_id,
        bindingFamily: 'post',
        hostedUseUrl: target.target_url,
      },
    ],
  })
  const noticeId = notice.id
  return noticeId
}
export async function readCopyrightApiApprovalStages(
  intake: { id: string; raw_storage_object_id: string | null },
  noticeId: string | undefined,
  imageId: string,
) {
  const { rows } = await write<{
    decision: string | null
    reviews: number
    evidence: number
    notices: number
    submissions: number
    targets: number
    assessments: number
    identities: number
    current_assessments: number
    events: string[]
    restrictions: number
    actions: number
    deliveries: string[]
    correspondence: string[]
    accepted: boolean
  }>(sql`/* approvalAdmission:stages */
    SELECT receipt.review_decision AS decision,
      EXISTS (SELECT 1 FROM copyright_notices WHERE id = ${noticeId ?? null} AND accepted_at IS NOT NULL) AS accepted,
      ARRAY(SELECT delivery_kind::text || ':' || channel::text FROM copyright_notice_delivery_work_items
        WHERE copyright_notice_id = ${noticeId ?? null} ORDER BY delivery_kind::text, channel::text) AS deliveries,
      ARRAY(SELECT correspondence_kind::text FROM copyright_notice_correspondence_messages
        WHERE copyright_notice_id = ${noticeId ?? null} ORDER BY correspondence_kind::text) AS correspondence,
      (SELECT count(*)::int FROM copyright_notice_email_intake_reviews WHERE copyright_notice_email_intake_receipt_id = ${intake.id}) AS reviews,
      (SELECT count(*)::int FROM copyright_notice_evidence_artifacts WHERE storage_object_id = ${intake.raw_storage_object_id}) AS evidence,
      (SELECT count(*)::int FROM copyright_notices notice WHERE EXISTS (
        SELECT 1 FROM copyright_notice_targets target JOIN copyright_notice_target_images image
          ON image.copyright_notice_target_id = target.id
        WHERE target.copyright_notice_id = notice.id AND image.image_id = ${imageId})) AS notices,
      (SELECT count(*)::int FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId ?? null}) AS submissions,
      (SELECT count(*)::int FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId ?? null}) AS targets,
      (SELECT count(*)::int FROM copyright_notice_submission_assessments assessment JOIN copyright_notice_submissions submission
        ON submission.id = assessment.copyright_notice_submission_id WHERE submission.copyright_notice_id = ${noticeId ?? null}) AS assessments,
      (SELECT count(*)::int FROM copyright_notice_submission_assessment_identities WHERE copyright_notice_id = ${noticeId ?? null}) AS identities,
      (SELECT count(*)::int FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId ?? null}
        AND current_assessment_is_substantially_compliant
        AND EXISTS (SELECT 1 FROM copyright_notice_submission_assessments assessment
          JOIN copyright_notice_submission_assessment_identities identity ON identity.id = assessment.id
          WHERE assessment.id = copyright_notice_submissions.current_assessment_identity_id
            AND assessment.copyright_notice_submission_id = copyright_notice_submissions.id
            AND identity.copyright_notice_submission_id = copyright_notice_submissions.id
            AND assessment.is_substantially_compliant)) AS current_assessments,
      ARRAY(SELECT change_type::text FROM copyright_notice_lifecycle_changes WHERE copyright_notice_id = ${noticeId ?? null} ORDER BY change_type::text) AS events,
      (SELECT count(*)::int FROM copyright_restrictions restriction JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
        WHERE target.copyright_notice_id = ${noticeId ?? null}) AS restrictions,
      (SELECT count(*)::int FROM copyright_notice_action_work_items action
        JOIN copyright_restrictions restriction ON restriction.id = action.copyright_restriction_id
        JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
        WHERE target.copyright_notice_id = ${noticeId ?? null}) AS actions
    FROM copyright_notice_email_intake_receipts receipt WHERE receipt.id = ${intake.id}`)
  return rows[0]
}
