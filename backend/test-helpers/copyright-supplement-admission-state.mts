import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightAssessmentRaceState } from './copyright-assessment-race-outcomes.mts'

/** Read the admitted legal stages and the independent recommendation's complete current identity. */
export async function readCopyrightSupplementAdmissionState(noticeId: string, intakeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate) throw new Error('Owned supplement case disappeared')
  const { rows: intakes } = await write<{
    amazon_ses_message_id: string
    clock: Date
    recommendation: string | null
    output: string | null
  }>(sql`/* readCopyrightSupplementAdmissionState:intake */
    SELECT amazon_ses_message_id, (SELECT last_legal_activity_at FROM copyright_notices WHERE id = ${noticeId}) AS clock, current_recommendation_identity_id AS recommendation,
      current_recommendation_output_ciphertext AS output
    FROM copyright_notice_email_intakes WHERE id = ${intakeId}`)
  const intake = intakes[0]!
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const [{ rows: recommendations }, { rows: identities }, { rows: links }, { rows: reviews }] =
    await Promise.all([
      write(sql`/* readCopyrightSupplementAdmissionState:recommendations */
        SELECT id, model, prompt_version, encode(input_sha256, 'hex') AS digest,
          structured_output_ciphertext AS output
        FROM copyright_notice_email_intake_recommendations
        WHERE copyright_notice_email_intake_receipt_id = ${intakeId} ORDER BY id`),
      write<{ id: string }>(sql`/* readCopyrightSupplementAdmissionState:identities */
        SELECT id FROM copyright_notice_email_intake_recommendation_identities
        WHERE copyright_notice_email_intake_receipt_id = ${intakeId} ORDER BY id`),
      write(sql`/* readCopyrightSupplementAdmissionState:links */
        SELECT link_kind, correspondence_action AS action, correspondence_kind AS kind,
          correspondence_submission_id AS submission, correspondence_message_id AS correspondence,
          correspondence_reviewed_by_id AS actor,
          correspondence_rationale_ciphertext AS rationale,
          correspondence_manual_fallback_reason_ciphertext AS fallback
        FROM copyright_notice_email_intake_notice_links
        WHERE copyright_notice_email_intake_id = ${intakeId}`),
      write(sql`/* readCopyrightSupplementAdmissionState:reviews */
        SELECT action, kind, reviewed_by_id AS actor,
          copyright_notice_submission_id AS submission,
          copyright_notice_correspondence_message_id AS correspondence,
          copyright_notice_email_intake_recommendation_id AS recommendation,
          rationale_ciphertext AS rationale, manual_fallback_reason_ciphertext AS fallback
        FROM copyright_notice_email_correspondence_reviews
        WHERE copyright_notice_email_intake_id = ${intakeId} ORDER BY id`),
    ])
  const decryptReview = (row: Record<string, unknown>) => ({
    ...row,
    rationale: row.rationale ? decryptSecret(row.rationale as string, purpose) : null,
    fallback: row.fallback ? decryptSecret(row.fallback as string, purpose) : null,
  })
  return {
    legal: await readCopyrightAssessmentRaceState(noticeId),
    submissions: aggregate.submissions.map(row => ({
      id: row.id,
      kind: row.kind,
      source: row.source_kind,
      actor: row.submitted_by_id,
      body: decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(row.id)),
    })),
    correspondence: aggregate.correspondence.map(row => ({
      id: row.id,
      intake: row.copyright_notice_email_intake_id,
      submission: row.copyright_notice_submission_id,
      direction: row.direction,
      kind: row.correspondence_kind,
    })),
    evidence: aggregate.evidenceArtifacts.map(row => ({
      submission: row.copyright_notice_submission_id,
      storage: row.storage_object_id,
      digest: row.sha256.toString('hex'),
      media: row.mime_type,
      size: row.byte_size,
    })),
    recommendations: recommendations.map(row => {
      if (typeof row.output !== 'string')
        throw new Error('Owned recommendation ciphertext is missing')
      return { ...row, output: decryptSecret(row.output, purpose) }
    }),
    identities: identities.map(row => row.id),
    current: {
      id: intake.recommendation,
      output: intake.output ? decryptSecret(intake.output, purpose) : null,
    },
    links: links.map(decryptReview),
    reviews: reviews.map(decryptReview),
    clock: intake.clock,
  }
}
