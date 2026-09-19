import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, write } from '../index.mts'

let noticeId: string
let submissionId: string

describe('copyright correspondence schema', () => {
  beforeAll(async () => {
    const { rows: noticeRows } = await write<{
      id: string
    }>(sql`/* createCopyrightCorrespondenceNotice */
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description, policy_version
      ) VALUES (
        'us_dmca', 'copyright', CURRENT_TIMESTAMP, ${`cipher-${randomUUID()}`},
        ${`work-${randomUUID()}`}, 'test-v1'
      ) RETURNING id
    `)
    noticeId = noticeRows[0]!.id
    const { rows: submissionRows } = await write<{ id: string }>(
      sql`/* createCopyrightCorrespondenceSubmission */
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (
        ${noticeId}, 'notice', CURRENT_TIMESTAMP, 'email', ${`submission-${randomUUID()}`}
      ) RETURNING id
    `,
    )
    submissionId = submissionRows[0]!.id
  })

  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('freezes inbound correspondence body on receipt', async () => {
    const { rows } = await write<{ id: string }>(sql`/* createCopyrightInboundCorrespondence */
      INSERT INTO copyright_notice_correspondence_messages (
        copyright_notice_id, copyright_notice_submission_id, direction, composition_kind,
        correspondence_kind, body_ciphertext
      ) VALUES (
        ${noticeId}, ${submissionId}, 'inbound', 'inbound', 'receipt', ${`inbound-${randomUUID()}`}
      ) RETURNING id
    `)

    await expect(
      write(sql`/* rejectCopyrightInboundCorrespondenceBodyMutation */
        UPDATE copyright_notice_correspondence_messages
        SET body_ciphertext = ${`changed-${randomUUID()}`}
        WHERE id = ${rows[0]!.id}
      `),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('freezes outbound correspondence body after it is sent', async () => {
    const { rows } = await write<{ id: string }>(sql`/* createCopyrightOutboundCorrespondence */
      INSERT INTO copyright_notice_correspondence_messages (
        copyright_notice_id, direction, composition_kind, correspondence_kind, body_ciphertext
      ) VALUES (
        ${noticeId}, 'outbound', 'deterministic_template', 'receipt', ${`outbound-${randomUUID()}`}
      ) RETURNING id
    `)
    await write(sql`/* markCopyrightOutboundCorrespondenceSent */
      UPDATE copyright_notice_correspondence_messages SET sent_at = CURRENT_TIMESTAMP
      WHERE id = ${rows[0]!.id}
    `)

    await expect(
      write(sql`/* rejectCopyrightSentCorrespondenceBodyMutation */
        UPDATE copyright_notice_correspondence_messages
        SET body_ciphertext = ${`changed-${randomUUID()}`}
        WHERE id = ${rows[0]!.id}
      `),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
