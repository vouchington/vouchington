import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import { encryptSecret } from '@modules/token-secrets/encryption'
import { copyrightSubmissionPurpose } from '@services/copyright-notices/submissions'

/** One aged open counter-notice, missed deadline and unreviewed email intake. */
export async function seedReviewTargetBreaches(noticeId: string): Promise<string> {
  const submissionId = seedUuid(0, '2b')
  const assessmentId = seedUuid(0, '2c')
  const deadlineId = seedUuid(0, '2d')
  const emailId = seedUuid(0, '2e')
  await write(
    `/* seedExplainReviewTargetBreaches:submission */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    VALUES ($1::uuid, $2::uuid, 'counter_notice', NOW() - INTERVAL '3 hours',
      'staff', $3::text) ON CONFLICT (id) DO NOTHING`,
    [submissionId, noticeId, encryptSecret('{}', copyrightSubmissionPurpose(submissionId))],
  )
  await write(
    `/* seedExplainReviewTargetBreaches:assessment */
    INSERT INTO copyright_notice_submission_assessments
      (id, copyright_notice_submission_id, assessed_at, assessed_by_id,
       is_substantially_compliant)
    VALUES ($1::uuid, $2::uuid, NOW() - INTERVAL '2 hours', $3::uuid, true)
    ON CONFLICT (id) DO NOTHING`,
    [assessmentId, submissionId, seedUuid(0, '01')],
  )
  await write(
    `/* seedExplainReviewTargetBreaches:deadline */
    INSERT INTO copyright_notice_deadlines
      (id, copyright_notice_id, qualifying_counter_notice_assessment_id,
       earliest_restoration_at, escalation_at, restoration_deadline_at)
    VALUES ($1::uuid, $2::uuid, $3::uuid,
      NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours',
      NOW() - INTERVAL '1 hour') ON CONFLICT (id) DO NOTHING`,
    [deadlineId, noticeId, assessmentId],
  )
  const { rows } = await read<{ id: string }>(
    `/* seedExplainReviewTargetBreaches:mediaType */ SELECT id::text FROM media_types LIMIT 1`,
  )
  assert.ok(rows[0]?.id, 'Development seed must include a media type')
  await write(
    `/* seedExplainReviewTargetBreaches:email */
    INSERT INTO copyright_notice_email_intakes
      (id, amazon_ses_message_id, received_at, raw_sha256, raw_media_type_id,
       raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict)
    VALUES ($1::uuid, 'explain-review-target-breach', NOW() - INTERVAL '3 hours',
      decode(repeat('11', 32), 'hex'), $2::bigint, 1,
      'pass', 'pass', 'pass', 'pass', 'pass') ON CONFLICT (id) DO NOTHING`,
    [emailId, rows[0].id],
  )
  return emailId
}
