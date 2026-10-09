import type { CopyrightSeedContext } from './copyright-context.mts'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightSubmissionPurpose } from '@services/copyright-notices/submissions'
import sql from 'sql-template-strings'

const COUNTER_NOTICE = {
  name: 'Voucha Dev Poster',
  address: '1 Example Way, Portsmouth',
  telephone: '+1 555 0100',
  consentToFederalJurisdiction: true,
  consentToServiceOfProcess: true,
  goodFaithMisidentificationUnderPenaltyOfPerjury: true,
  electronicSignature: 'Voucha Dev Poster',
}

/**
 * Reviews a form intake and an accepted counter notice for a case whose deadline is past
 * escalation: 10 days of waiting have passed, escalation was 6 hours ago, and restoration is 2
 * days out. This is raw SQL because the real counter-notice path computes its window from the
 * clock, and the deadline's schedule columns cannot be updated afterwards. The rows are only
 * enough for the staff queue; no restriction exists for the counter notice to restore. The notice
 * itself is received at seed time (its receipt is immutable), so these review dates pre-date it.
 */
export async function seedCopyrightDeadline(input: {
  noticeId: string
  intakeId: string
  reviewerId: string
  context: CopyrightSeedContext
}): Promise<void> {
  const { identity, now } = input.context
  const { submissionId, assessmentId, deadlineId } = identity
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightDeadline:formReview */
    INSERT INTO copyright_notice_form_intake_reviews (
      copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext
    ) VALUES (
      ${input.intakeId}, ${now}::timestamptz - INTERVAL '21 days', ${input.reviewerId}, true,
      ${encryptSecret('Complete notice from a named claimant.', `copyright-form-review:${input.intakeId}`)}
    ) ON CONFLICT DO NOTHING
  `)
  const { rowCount: seeded } = await transaction(sql`/* seedCopyrightDeadline:exists */
    SELECT 1 FROM copyright_notice_deadlines WHERE id = ${deadlineId}
  `)
  if (!seeded) {
    await transaction(sql`/* seedCopyrightDeadline:counterNotice */
      INSERT INTO copyright_notice_submissions (
        id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${submissionId}, ${input.noticeId}, 'counter_notice',
        ${now}::timestamptz - INTERVAL '20 days', 'staff',
        ${encryptSecret(JSON.stringify(COUNTER_NOTICE), copyrightSubmissionPurpose(submissionId))}
      )
    `)
    await transaction(sql`/* seedCopyrightDeadline:assessment */
      INSERT INTO copyright_notice_submission_assessments (
        id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      ) VALUES (
        ${assessmentId}, ${submissionId}, ${now}::timestamptz - INTERVAL '19 days',
        ${input.reviewerId}, true
      )
    `)
    await transaction(sql`/* seedCopyrightDeadline:deadline */
      INSERT INTO copyright_notice_deadlines (
        id, copyright_notice_id, qualifying_counter_notice_assessment_id,
        earliest_restoration_at, escalation_at, restoration_deadline_at
      ) VALUES (
        ${deadlineId}, ${input.noticeId}, ${assessmentId},
        ${now}::timestamptz - INTERVAL '10 days', ${now}::timestamptz - INTERVAL '6 hours',
        ${now}::timestamptz + INTERVAL '2 days'
      )
    `)
    await transaction(sql`/* seedCopyrightDeadline:counterNoticeReview */
      INSERT INTO copyright_notice_counter_notice_reviews (
        copyright_notice_submission_id, copyright_notice_submission_assessment_id,
        copyright_notice_deadline_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext
      ) VALUES (
        ${submissionId}, ${assessmentId}, ${deadlineId}, ${now}::timestamptz - INTERVAL '19 days',
        ${input.reviewerId}, true,
        ${encryptSecret('Counter notice names the material and consents to jurisdiction.', `copyright-counter-review:${submissionId}`)}
      )
    `)
  }
  await transaction.commit()
}
