import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function seedUnusedCopyrightGuestCapability(
  noticeId: string,
  expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000),
): Promise<string> {
  const id = uuidv7()
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedUnusedCopyrightGuestCapabilityIdentity */
    INSERT INTO copyright_notice_guest_capability_identities (id, copyright_notice_id)
    VALUES (${id}, ${noticeId})`)
  await transaction(sql`/* seedUnusedCopyrightGuestCapability */
    INSERT INTO copyright_notice_guest_capabilities
      (id, copyright_notice_id, token_hash, expires_at)
    VALUES (${id}, ${noticeId}, ${`test-guest-${randomUUID()}`}, ${expiresAt})`)
  await transaction.commit()
  return id
}

export async function seedCopyrightGuestCapabilitySubmission(
  noticeId: string,
  capabilityId: string,
): Promise<void> {
  await write(sql`/* seedCopyrightGuestCapabilitySubmission */
    INSERT INTO copyright_notice_submissions
      (copyright_notice_id, kind, received_at, source_kind, body_ciphertext,
       copyright_notice_guest_capability_id)
    VALUES (${noticeId}, 'supplement', CURRENT_TIMESTAMP, 'guest_form', 'v1:test-supplement',
      ${capabilityId})`)
}

export async function seedCopyrightGuestCapabilityLifecycle(
  noticeId: string,
  capabilityId: string,
): Promise<void> {
  await write(sql`/* seedCopyrightGuestCapabilityLifecycle */
    INSERT INTO copyright_notice_lifecycle_changes
      (copyright_notice_id, change_type, copyright_notice_guest_capability_id)
    VALUES (${noticeId}, 'guest_capability_issued', ${capabilityId})`)
}

export async function readCopyrightGuestCapabilityIdentity(id: string): Promise<boolean> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightGuestCapabilityIdentity */
    SELECT id FROM copyright_notice_guest_capability_identities WHERE id = ${id}`)
  return rows.length > 0
}
