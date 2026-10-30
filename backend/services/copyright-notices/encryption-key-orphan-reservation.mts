import { beginBoundedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCopyrightRetentionWindows } from './config.mts'
import { destroyCopyrightEncryptionKeyObject } from './encryption-key-objects.mts'

/** Reclaim one reservation independently; never retain live-owner key locks across other S3 calls. */
export async function reclaimCopyrightEncryptionKeyReservation(
  id: string,
  nowOverride?: Date,
): Promise<boolean> {
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  const { rows: locked } = await query(sql`/* lockCopyrightOrphanKeyReservation */
    SELECT id FROM copyright_retention_keys WHERE id = ${id} FOR UPDATE`)
  if (!locked.length) return false
  const now = nowOverride ?? new Date()
  const cutoff = new Date(
    now.getTime() - getCopyrightRetentionWindows().encryptionOrphanGraceHours * 3_600_000,
  )
  const { rows } = await query(sql`/* recheckCopyrightOrphanKeyReservation */
    SELECT id FROM copyright_retention_keys key WHERE key.id = ${id}
      AND GREATEST(key.created_at, key.object_created_at) <= ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_encryption_keys owned WHERE owned.copyright_retention_key_id = key.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_email_intake_encryption_keys owned WHERE owned.copyright_retention_key_id = key.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_email_receipt_encryption_keys owned WHERE owned.copyright_retention_key_id = key.id)`)
  if (!rows.length) return false
  // ast-grep-ignore: no-three-sequential-awaits -- Confirm all external key versions destroyed before marking and deleting the locked orphan handle in this transaction.
  await destroyCopyrightEncryptionKeyObject(id)
  await query(sql`/* markCopyrightOrphanKeyDestroyed */ UPDATE copyright_retention_keys
    SET destroyed_at = COALESCE(destroyed_at, clock_timestamp()) WHERE id = ${id}`)
  await query(
    sql`/* deleteCopyrightOrphanKeyReservation */ DELETE FROM copyright_retention_keys WHERE id = ${id}`,
  )
  await query.commit()
  return true
}
