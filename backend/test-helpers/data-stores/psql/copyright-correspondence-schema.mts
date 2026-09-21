import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CopyrightCorrespondenceSchemaFixture = {
  noticeId: string
  submissionId: string
}

export async function createCopyrightCorrespondenceSchemaFixture(): Promise<CopyrightCorrespondenceSchemaFixture> {
  const { rows } = await write<{ notice_id: string; submission_id: string }>(
    sql`/* createCopyrightCorrespondenceSchemaFixture */
      WITH notice AS (
        INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description, policy_version)
        VALUES ('us_dmca', 'copyright', CURRENT_TIMESTAMP, ${`cipher-${randomUUID()}`}, ${`work-${randomUUID()}`}, 'test-v1')
        RETURNING id
      ), submission AS (
        INSERT INTO copyright_notice_submissions (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
        SELECT id, 'notice', CURRENT_TIMESTAMP, 'email', ${`submission-${randomUUID()}`} FROM notice
        RETURNING id
      )
      SELECT notice.id AS notice_id, submission.id AS submission_id FROM notice CROSS JOIN submission`,
  )
  return { noticeId: rows[0]!.notice_id, submissionId: rows[0]!.submission_id }
}

export async function createCopyrightInboundCorrespondence(
  fixture: CopyrightCorrespondenceSchemaFixture,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createCopyrightInboundCorrespondence */
    INSERT INTO copyright_notice_correspondence_messages (copyright_notice_id, copyright_notice_submission_id, direction, composition_kind, correspondence_kind, body_ciphertext)
    VALUES (${fixture.noticeId}, ${fixture.submissionId}, 'inbound', 'inbound', 'receipt', ${`inbound-${randomUUID()}`}) RETURNING id`)
  return rows[0]!.id
}

export function rejectCopyrightInboundCorrespondenceBodyMutation(id: string) {
  return write(sql`/* rejectCopyrightInboundCorrespondenceBodyMutation */
    UPDATE copyright_notice_correspondence_messages SET body_ciphertext = ${`changed-${randomUUID()}`} WHERE id = ${id}`)
}

export async function createAndSendCopyrightOutboundCorrespondence(
  fixture: CopyrightCorrespondenceSchemaFixture,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createCopyrightOutboundCorrespondence */
    INSERT INTO copyright_notice_correspondence_messages (copyright_notice_id, direction, composition_kind, correspondence_kind, body_ciphertext)
    VALUES (${fixture.noticeId}, 'outbound', 'deterministic_template', 'receipt', ${`outbound-${randomUUID()}`}) RETURNING id`)
  const id = rows[0]!.id
  await write(sql`/* markCopyrightOutboundCorrespondenceSent */
    UPDATE copyright_notice_correspondence_messages SET sent_at = CURRENT_TIMESTAMP WHERE id = ${id}`)
  return id
}

export function rejectCopyrightSentCorrespondenceBodyMutation(id: string) {
  return write(sql`/* rejectCopyrightSentCorrespondenceBodyMutation */
    UPDATE copyright_notice_correspondence_messages SET body_ciphertext = ${`changed-${randomUUID()}`} WHERE id = ${id}`)
}
