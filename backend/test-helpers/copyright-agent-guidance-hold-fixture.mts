import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { preemptCopyrightRestorations } from '../services/copyright-notices/restore-preemption.mts'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'

/** A committed guest hold retains capability provenance, encrypted summary, urgent class and legal audit. */
export async function seedAgentGuidanceHold(input: {
  noticeId: string
  capabilityId: string
  now: Date
  statement: string
}) {
  const id = uuidv7()
  await using transaction = await beginTransaction()
  const { rows: capabilities } = await transaction<{
    id: string
  }>(sql`/* seedAgentGuidanceHold:capability */
    SELECT id FROM copyright_notice_guest_capabilities WHERE id = ${input.capabilityId}
      AND copyright_notice_id = ${input.noticeId} AND revoked_at IS NULL AND expires_at > ${input.now}
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.copyright_notice_guest_capability_id = ${input.capabilityId}
          AND submission.kind = 'court_or_ccb_hold')`)
  if (!capabilities[0]) throw new Error('Owned guidance hold capability is not current')
  await preemptCopyrightRestorations(input.noticeId, transaction)
  await transaction(sql`/* seedAgentGuidanceHold:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_submission_id)
    VALUES (${input.noticeId}, 'court_or_ccb_hold_received', ${id})`)
  const { rows } = await transaction<{
    id: string
    kind: 'court_or_ccb_hold'
    received_at: Date
  }>(sql`/* seedAgentGuidanceHold:submission */
    INSERT INTO copyright_notice_submissions (id, copyright_notice_id, kind, received_at, source_kind,
      submitted_by_id, body_ciphertext, copyright_notice_guest_capability_id)
    VALUES (${id}, ${input.noticeId}, 'court_or_ccb_hold', ${input.now}, 'guest_form', NULL,
      ${encryptSecret(JSON.stringify({ summary: input.statement }), copyrightSubmissionPurpose(id))}, ${input.capabilityId})
    RETURNING id, kind, received_at`)
  await transaction(sql`/* seedAgentGuidanceHold:urgent */
    INSERT INTO copyright_notice_urgent_filings (copyright_notice_submission_id, classified_at)
    VALUES (${id}, ${input.now})`)
  await readCopyrightThreadRetirement(transaction, [input.noticeId])
  await transaction.commit()
  const submission = rows[0]
  if (!submission) throw new Error('Owned guidance hold disappeared')
  return submission
}
