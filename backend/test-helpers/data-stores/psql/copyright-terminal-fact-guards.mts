import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type Fixture = { noticeId: string; recorderId: string; staffId: string; complaintId: string }
type ComplaintRead = { recorderId: string | null; otherFields: unknown }

async function insertFixture(): Promise<Fixture> {
  const { rows } = await write<{
    notice_id: string
    recorder_id: string
    staff_id: string
    complaint_id: string
  }>(sql`/* insertTerminalFactGuardFixture */
    WITH recorder AS (INSERT INTO users DEFAULT VALUES RETURNING id),
    staff AS (INSERT INTO users DEFAULT VALUES RETURNING id),
    notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description,
        policy_version
      ) VALUES ('eu_dsa', 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1')
      RETURNING id
    ), complaint AS (
      INSERT INTO copyright_eu_supervised_complaints (
        copyright_notice_id, jurisdiction, recorded_by_id, idempotency_key, authority_reference,
        explanation_ciphertext
      ) SELECT notice.id, 'eu_dsa', recorder.id, ${randomUUID()}, 'authority-1', 'explanation'
      FROM notice CROSS JOIN recorder
      RETURNING id
    )
    SELECT notice.id AS notice_id, recorder.id AS recorder_id, staff.id AS staff_id,
      complaint.id AS complaint_id
    FROM notice, recorder, staff, complaint`)
  const row = rows[0]!
  return {
    noticeId: row.notice_id,
    recorderId: row.recorder_id,
    staffId: row.staff_id,
    complaintId: row.complaint_id,
  }
}

async function readComplaint(complaintId: string): Promise<ComplaintRead> {
  const { rows } = await read<{ recorded_by_id: string | null; other_fields: unknown }>(
    sql`/* readTerminalFactGuardComplaint */
    SELECT recorded_by_id, to_jsonb(complaint) - 'recorded_by_id' AS other_fields
    FROM copyright_eu_supervised_complaints complaint WHERE id = ${complaintId}`,
  )
  return { recorderId: rows[0]!.recorded_by_id, otherFields: rows[0]!.other_fields }
}

/** Hard-deletes the user who recorded a complaint, before or after it is resolved. */
export async function deleteComplaintRecorder(
  resolved: boolean,
): Promise<{ before: ComplaintRead; after: ComplaintRead }> {
  const fixture = await insertFixture()
  if (resolved) {
    await write(sql`/* resolveTerminalFactGuardComplaint */
      UPDATE copyright_eu_supervised_complaints
      SET resolved_at = CURRENT_TIMESTAMP, resolved_by_id = ${fixture.staffId}
      WHERE id = ${fixture.complaintId}`)
  }
  const before = await readComplaint(fixture.complaintId)
  await write(sql`/* deleteTerminalFactGuardRecorder */
    DELETE FROM users WHERE id = ${fixture.recorderId}`)
  return { before, after: await readComplaint(fixture.complaintId) }
}

async function errorCode(attempt: Promise<unknown>): Promise<string | undefined> {
  try {
    await attempt
    return undefined
  } catch (err) {
    return (err as { code?: string }).code
  }
}

/** SQLSTATE of an ordinary delete of each guarded legal-fact row; undefined if it succeeded. */
export async function deleteGuardedFactRows(): Promise<{
  hold: string | undefined
  escalation: string | undefined
  complaint: string | undefined
}> {
  const fixture = await insertFixture()
  const { rows } = await write<{ escalation_id: string; hold_id: string }>(
    sql`/* insertTerminalFactGuardChildren */
    WITH escalation AS (
      INSERT INTO copyright_territorial_escalations (
        copyright_notice_id, jurisdiction, copyright_eu_supervised_complaint_id
      ) VALUES (${fixture.noticeId}, 'eu_dsa', ${fixture.complaintId})
      RETURNING id
    ), hold AS (
      INSERT INTO copyright_case_preservation_holds (copyright_notice_id, kind, placed_by_id)
      SELECT ${fixture.noticeId}, (enum_range(NULL::copyright_case_preservation_kinds))[1],
        ${fixture.staffId}
      RETURNING id
    )
    SELECT escalation.id AS escalation_id, hold.id AS hold_id FROM escalation, hold`,
  )
  const ids = rows[0]!
  return {
    hold: await errorCode(
      write(sql`/* deleteTerminalFactGuardHold */
        DELETE FROM copyright_case_preservation_holds WHERE id = ${ids.hold_id}`),
    ),
    escalation: await errorCode(
      write(sql`/* deleteTerminalFactGuardEscalation */
        DELETE FROM copyright_territorial_escalations WHERE id = ${ids.escalation_id}`),
    ),
    complaint: await errorCode(
      write(sql`/* deleteTerminalFactGuardComplaint */
        DELETE FROM copyright_eu_supervised_complaints WHERE id = ${fixture.complaintId}`),
    ),
  }
}
