import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

describe('copyright actor erasure', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('nulls user links without erasing immutable legal decisions', async () => {
    const { rows: users } = await write<{ id: string }>(
      '/* createCopyrightErasureActor */ INSERT INTO users DEFAULT VALUES RETURNING id',
    )
    const actorId = users[0]!.id
    const { rows: notices } = await write<{ id: string }>(sql`/* createCopyrightErasureNotice */
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext,
        work_description, policy_version
      ) VALUES (
        'us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        ${`cipher-${randomUUID()}`}, ${`work-${randomUUID()}`}, 'test-v1'
      )
      RETURNING id
    `)
    const noticeId = notices[0]!.id
    const { rows: submissions } = await write<{
      id: string
    }>(sql`/* createCopyrightErasureSubmission */
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) VALUES (${noticeId}, 'notice', CURRENT_TIMESTAMP, 'staff', ${`body-${randomUUID()}`})
      RETURNING id
    `)
    const submissionId = submissions[0]!.id
    await write(sql`/* createCopyrightErasureAuditRecords */
      WITH assessment AS (
        INSERT INTO copyright_notice_submission_assessments (
          copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
        ) VALUES (${submissionId}, CURRENT_TIMESTAMP, ${actorId}, true)
      ), correspondence AS (
        INSERT INTO copyright_notice_correspondence_messages (
          copyright_notice_id, direction, composition_kind, correspondence_kind,
          body_ciphertext, drafted_by_id
        ) VALUES (
          ${noticeId}, 'outbound', 'staff', 'status_update', ${`message-${randomUUID()}`}, ${actorId}
        )
      )
      INSERT INTO copyright_notice_lifecycle_events (
        copyright_notice_id, event_type, actor_user_id
      ) VALUES (${noticeId}, 'test_actor_action', ${actorId})
    `)
    await write(sql`/* eraseCopyrightAuditActor */ DELETE FROM users WHERE id = ${actorId}`)

    const { rows } = await read<{
      assessed_by_id: null
      drafted_by_id: null
      actor_user_id: null
    }>(sql`/* readCopyrightErasedAuditActors */
      SELECT assessment.assessed_by_id, correspondence.drafted_by_id, event.actor_user_id
      FROM copyright_notice_submission_assessments assessment
      CROSS JOIN copyright_notice_correspondence_messages correspondence
      CROSS JOIN copyright_notice_lifecycle_events event
      WHERE assessment.copyright_notice_submission_id = ${submissionId}
        AND correspondence.copyright_notice_id = ${noticeId}
        AND event.copyright_notice_id = ${noticeId}
        AND event.event_type = 'test_actor_action'
    `)

    expect(rows).toEqual([{ assessed_by_id: null, drafted_by_id: null, actor_user_id: null }])
  })
})
