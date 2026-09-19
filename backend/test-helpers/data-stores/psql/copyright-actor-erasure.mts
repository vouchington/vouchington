import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function eraseCopyrightActorAndReadAuditLinks(): Promise<{
  assessedById: null
  draftedById: null
  actorUserId: null
}> {
  const { rows } = await write<{ actor_id: string; notice_id: string; submission_id: string }>(
    sql`/* createCopyrightErasureAuditFixture */
      WITH actor AS (INSERT INTO users DEFAULT VALUES RETURNING id),
      notice AS (
        INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext, work_description, policy_version)
        VALUES ('us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${`cipher-${randomUUID()}`}, ${`work-${randomUUID()}`}, 'test-v1') RETURNING id
      ), submission AS (
        INSERT INTO copyright_notice_submissions (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
        SELECT id, 'notice', CURRENT_TIMESTAMP, 'staff', ${`body-${randomUUID()}`} FROM notice RETURNING id
      ), assessment AS (
        INSERT INTO copyright_notice_submission_assessments (copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant)
        SELECT submission.id, CURRENT_TIMESTAMP, actor.id, true FROM submission CROSS JOIN actor
      ), correspondence AS (
        INSERT INTO copyright_notice_correspondence_messages (copyright_notice_id, direction, composition_kind, correspondence_kind, body_ciphertext, drafted_by_id)
        SELECT notice.id, 'outbound', 'staff', 'status_update', ${`message-${randomUUID()}`}, actor.id FROM notice CROSS JOIN actor
      ), event AS (
        INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id)
        SELECT notice.id, 'test_actor_action', actor.id FROM notice CROSS JOIN actor
      )
      SELECT actor.id AS actor_id, notice.id AS notice_id, submission.id AS submission_id FROM actor CROSS JOIN notice CROSS JOIN submission`,
  )
  const fixture = rows[0]!
  await write(sql`/* eraseCopyrightAuditActor */ DELETE FROM users WHERE id = ${fixture.actor_id}`)
  const result = await read<{ assessed_by_id: null; drafted_by_id: null; actor_user_id: null }>(
    sql`/* readCopyrightErasedAuditActors */
      SELECT assessment.assessed_by_id, correspondence.drafted_by_id, event.actor_user_id
      FROM copyright_notice_submission_assessments assessment
      CROSS JOIN copyright_notice_correspondence_messages correspondence
      CROSS JOIN copyright_notice_lifecycle_events event
      WHERE assessment.copyright_notice_submission_id = ${fixture.submission_id}
        AND correspondence.copyright_notice_id = ${fixture.notice_id}
        AND event.copyright_notice_id = ${fixture.notice_id}
        AND event.event_type = 'test_actor_action'`,
  )
  return {
    assessedById: result.rows[0]!.assessed_by_id,
    draftedById: result.rows[0]!.drafted_by_id,
    actorUserId: result.rows[0]!.actor_user_id,
  }
}
