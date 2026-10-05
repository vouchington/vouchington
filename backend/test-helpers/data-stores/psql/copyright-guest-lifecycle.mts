import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertGuestLifecycleCounterDeadline(input: {
  noticeId: string
  receivedAt: Date
  actorId: string
  bodyCiphertext: string
  earliestRestorationAt: Date
  escalationAt: Date
  restorationDeadlineAt: Date
}): Promise<void> {
  await write(sql`/* insertGuestLifecycleCounterDeadline */
    WITH counter_notice AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${input.noticeId}, 'counter_notice', ${input.receivedAt}, 'signed_in_form',
        ${input.bodyCiphertext}
      ) RETURNING id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      ) SELECT id, ${input.receivedAt}, ${input.actorId}, true FROM counter_notice
      RETURNING id
    )
    INSERT INTO copyright_notice_deadlines (
      copyright_notice_id, qualifying_counter_notice_assessment_id, earliest_restoration_at,
      escalation_at, restoration_deadline_at
    ) SELECT ${input.noticeId}, id, ${input.earliestRestorationAt}, ${input.escalationAt},
      ${input.restorationDeadlineAt}
    FROM assessment
  `)
}

export async function insertGuestLifecycleRestriction(input: {
  submissionId: string
  targetId: string
  receivedAt: Date
  actorId: string
}): Promise<void> {
  await write(sql`/* insertGuestLifecycleRestriction */
    WITH assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      ) VALUES (${input.submissionId}, ${input.receivedAt}, ${input.actorId}, true)
      RETURNING id
    )
    INSERT INTO copyright_restrictions (
      copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id
    ) SELECT ${input.targetId}, id, ${input.receivedAt}, ${input.actorId} FROM assessment
  `)
}

export async function readCopyrightSubmissionCiphertext(submissionId: string): Promise<string> {
  const { rows } = await read<{
    body_ciphertext: string
  }>(sql`/* readCopyrightSubmissionCiphertext */
    SELECT body_ciphertext FROM copyright_notice_submissions WHERE id = ${submissionId}`)
  if (!rows[0]) throw new Error(`Copyright submission not found: ${submissionId}`)
  return rows[0].body_ciphertext
}

export async function countCopyrightUrgentFilings(submissionId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countCopyrightUrgentFilings */
    SELECT count(*)::text AS count FROM copyright_notice_urgent_filings
    WHERE copyright_notice_submission_id = ${submissionId}`)
  return Number(rows[0]?.count ?? 0)
}

export async function markCopyrightNoticeAccepted(
  noticeId: string,
  acceptedAt: Date,
): Promise<void> {
  await write(sql`/* markCopyrightNoticeAccepted */
    UPDATE copyright_notices SET accepted_at = ${acceptedAt} WHERE id = ${noticeId}`)
}

export async function readCopyrightCorrespondenceCiphertext(messageId: string): Promise<string> {
  const { rows } = await read<{ body_ciphertext: string }>(
    sql`/* readCopyrightCorrespondenceCiphertext */
      SELECT body_ciphertext FROM copyright_notice_correspondence_messages WHERE id = ${messageId}`,
  )
  if (!rows[0]) throw new Error(`Copyright correspondence not found: ${messageId}`)
  return rows[0].body_ciphertext
}

export async function readCopyrightGuestCapabilityExpiresAt(capabilityId: string): Promise<Date> {
  const { rows } = await read<{ expires_at: Date }>(sql`/* readCopyrightGuestCapabilityExpiresAt */
    SELECT expires_at FROM copyright_notice_guest_capabilities WHERE id = ${capabilityId}`)
  if (!rows[0]) throw new Error(`Copyright guest capability not found: ${capabilityId}`)
  return rows[0].expires_at
}

export async function countCopyrightGuestCapabilities(noticeId: string): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`/* countCopyrightGuestCapabilities */
    SELECT count(*)::text AS count FROM copyright_notice_guest_capabilities
    WHERE copyright_notice_id = ${noticeId}`)
  return Number(rows[0]?.count ?? 0)
}

export async function readCopyrightGuestCapabilityState(
  capabilityId: string,
): Promise<{ issued_by_id: string | null; revoked_at: Date | null }> {
  const { rows } = await read<{ issued_by_id: string | null; revoked_at: Date | null }>(
    sql`/* readCopyrightGuestCapabilityState */
      SELECT issued_by_id, revoked_at FROM copyright_notice_guest_capabilities
      WHERE id = ${capabilityId}`,
  )
  if (!rows[0]) throw new Error(`Copyright guest capability not found: ${capabilityId}`)
  return rows[0]
}

export async function listCopyrightGuestCapabilityEvents(
  capabilityId: string,
): Promise<Array<{ change_type: string; changed_by_id: string | null }>> {
  const { rows } = await read<{ change_type: string; changed_by_id: string | null }>(
    sql`/* listCopyrightGuestCapabilityEvents */
      SELECT change_type, changed_by_id FROM copyright_notice_lifecycle_changes
      WHERE copyright_notice_guest_capability_id = ${capabilityId}
      ORDER BY id`,
  )
  return rows
}
