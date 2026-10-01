import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ReplyRow = {
  noticeId: string | null
  intakeId: string | null
  role: string
  kind: string
  channel: string
  body: string | null
}

// A valid reply to a declined email intake; each rejection below breaks exactly one rule of it.
const validReply: ReplyRow = {
  noticeId: null,
  intakeId: null,
  role: 'correspondent',
  kind: 'email_intake_rejected',
  channel: 'email',
  body: 'v1:reply-body',
}

export async function createCopyrightEmailIntakeRow(): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createCopyrightEmailIntakeRow */
    INSERT INTO copyright_notice_email_intakes (
      ses_message_id, received_at, raw_storage_key, raw_sha256, raw_mime_type, raw_byte_size,
      spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict
    ) VALUES (
      ${`ses-${randomUUID()}`}, CURRENT_TIMESTAMP, ${`email/${randomUUID()}.eml`},
      ${Buffer.alloc(32, 1)}, 'message/rfc822', 1,
      'pass', 'pass', 'pass', 'pass', 'pass'
    ) RETURNING id`)
  return rows[0]!.id
}

function insertReply(overrides: Partial<ReplyRow>) {
  const row = { ...validReply, ...overrides }
  return write<{ id: string }>(sql`/* insertCopyrightEmailIntakeReplyRow */
    INSERT INTO copyright_notice_delivery_intents (
      copyright_notice_id, copyright_notice_email_intake_id, recipient_role, delivery_kind, channel,
      idempotency_key, body_ciphertext
    ) VALUES (
      ${row.noticeId}, ${row.intakeId}, ${row.role}, ${row.kind}, ${row.channel},
      ${`reply-schema-${randomUUID()}`}, ${row.body}
    ) RETURNING id`)
}

export async function createCopyrightEmailIntakeReplyRow(intakeId: string): Promise<string> {
  const { rows } = await insertReply({ intakeId })
  return rows[0]!.id
}

export const rejectReplyOwnedByNobody = () =>
  insertReply({ kind: 'status_update', role: 'claimant', channel: 'in_app', body: null })

// The unknown notice never reaches its foreign key: the ownership rule fails the row first.
export const rejectReplyOwnedByNoticeAndIntake = (intakeId: string) =>
  insertReply({ noticeId: randomUUID(), intakeId })

export const rejectReplyWithCaseDeliveryKind = (intakeId: string) =>
  insertReply({ intakeId, kind: 'status_update' })

export const rejectReplyWithoutBody = (intakeId: string) => insertReply({ intakeId, body: null })

export const rejectReplyToClaimant = (intakeId: string) =>
  insertReply({ intakeId, role: 'claimant' })

export const rejectReplyInApp = (intakeId: string) => insertReply({ intakeId, channel: 'in_app' })

export const rejectSecondReplyForIntake = (intakeId: string) => insertReply({ intakeId })

export const rejectReplyIntakeReassignment = (intentId: string, otherIntakeId: string) =>
  write(sql`/* rejectCopyrightReplyIntakeReassignment */
    UPDATE copyright_notice_delivery_intents SET copyright_notice_email_intake_id = ${otherIntakeId}
    WHERE id = ${intentId}`)

export const rejectReplyBodyMutation = (intentId: string) =>
  write(sql`/* rejectCopyrightReplyBodyMutation */
    UPDATE copyright_notice_delivery_intents SET body_ciphertext = 'v1:changed'
    WHERE id = ${intentId}`)

export const rejectReplyDeletion = (intentId: string) =>
  write(sql`/* rejectCopyrightReplyDeletion */
    DELETE FROM copyright_notice_delivery_intents WHERE id = ${intentId}`)
