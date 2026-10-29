import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { destroyCopyrightEncryptionKeyObject } from './encryption-key-objects.mts'
import type { CopyrightEncryptionOwner } from './encryption-keys.mts'

/** Caller holds the owner's lifetime lock and has proved all applicable case blockers and clocks. */
export async function destroyCopyrightOwnerEncryptionKey(
  owner: CopyrightEncryptionOwner,
  query: TransactionQuery,
): Promise<void> {
  const statement =
    owner.kind === 'notice'
      ? sql`/* lockCopyrightNoticeKeyDestruction */ SELECT key.id, key.destroyed_at FROM copyright_notice_encryption_keys owned
      JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
      WHERE owned.copyright_notice_id = ${owner.id} FOR UPDATE OF key`
      : owner.kind === 'receipt'
        ? sql`/* lockCopyrightReceiptKeyDestruction */ SELECT key.id, key.destroyed_at FROM copyright_email_receipt_encryption_keys owned
      JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
      WHERE owned.copyright_notice_email_intake_receipt_id = ${owner.id} FOR UPDATE OF key`
        : sql`/* lockCopyrightIntakeKeyDestruction */ SELECT key.id, key.destroyed_at FROM copyright_email_intake_encryption_keys owned
      JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
      WHERE owned.copyright_notice_email_intake_id = ${owner.id} FOR UPDATE OF key`
  const { rows } = await query<{ id: string; destroyed_at: Date | null }>(statement)
  if (!rows[0]) {
    if (owner.kind === 'notice') throw new Error('Copyright case data-key attachment is missing')
    return
  }
  if (rows[0].destroyed_at) return
  await destroyCopyrightEncryptionKeyObject(rows[0].id)
  await query(sql`/* recordCopyrightEncryptionKeyDestruction */
    UPDATE copyright_retention_keys SET destroyed_at = clock_timestamp() WHERE id = ${rows[0].id} AND destroyed_at IS NULL`)
}
