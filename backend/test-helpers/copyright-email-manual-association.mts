import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The smallest accepted case row for a staff association boundary. */
export async function createCopyrightNoticeForManualAssociation(accepted = true): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`
    /* createCopyrightNoticeForManualAssociation */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, accepted_at,
      claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      'us_dmca', 'copyright', CURRENT_TIMESTAMP,
      CASE WHEN ${accepted} THEN CURRENT_TIMESTAMP ELSE NULL END,
      ${`cipher-${randomUUID()}`}, ${`work-${randomUUID()}`}, 'test-v1'
    ) RETURNING id
  `)
  return rows[0]!.id
}

/** Read only the immutable staff association event for this intake. */
export async function readCopyrightEmailManualAssociationEvent(intakeId: string) {
  const { rows } = await read<{
    copyright_notice_id: string
    changed_by_id: string
    copyright_notice_email_intake_id: string
  }>(sql`
    /* readCopyrightEmailManualAssociationEvent */
    SELECT copyright_notice_id, changed_by_id, copyright_notice_email_intake_id
    FROM copyright_notice_lifecycle_changes
    WHERE copyright_notice_email_intake_id = ${intakeId}
      AND change_type = 'email_intake_manually_associated'
  `)
  return rows
}

export async function readCopyrightEmailManualAssociationReview(intakeId: string) {
  const { rows } = await read<{ copyright_notice_id: string; action: string }>(sql`
    /* readCopyrightEmailManualAssociationReview */
    SELECT copyright_notice_id, action
    FROM copyright_notice_email_correspondence_reviews
    WHERE copyright_notice_email_intake_id = ${intakeId}
  `)
  return rows
}

/** Exercise the actor and case/intake FK constraints without bypassing the real table. */
export function insertCopyrightEmailManualAssociationEvent(
  noticeId: string,
  intakeId: string,
  actorId: string | null,
) {
  return write(sql`
    /* insertCopyrightEmailManualAssociationEvent */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id, copyright_notice_email_intake_id
    ) VALUES (${noticeId}, 'email_intake_manually_associated', ${actorId}, ${intakeId})
  `)
}
