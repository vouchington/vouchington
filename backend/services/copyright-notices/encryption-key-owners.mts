import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { lockCopyrightIntakeCaseLifetimes } from './encryption-intake-lifetimes.mts'
import type {
  CopyrightEncryptionOwner,
  CopyrightEncryptionSubject,
} from './encryption-key-capabilities.mts'

export async function readScopedCopyrightKeyId(
  owner: CopyrightEncryptionOwner,
  query: TransactionQuery,
  write = false,
): Promise<string> {
  if (owner.kind !== 'notice') await lockCopyrightIntakeCaseLifetimes(query, [owner.id])
  const parent =
    owner.kind === 'notice'
      ? sql`/* lockCopyrightEncryptionNoticeLifetime */ SELECT id FROM copyright_notices WHERE id = ${owner.id}`
      : owner.kind === 'receipt'
        ? sql`/* lockCopyrightEncryptionReceiptLifetime */ SELECT id FROM copyright_notice_email_intake_receipts WHERE id = ${owner.id}`
        : sql`/* lockCopyrightEncryptionIntakeLifetime */ SELECT id FROM copyright_notice_email_intakes WHERE id = ${owner.id}`
  parent.append(write ? ' FOR UPDATE' : ' FOR SHARE')
  const { rows: parents } = await query(parent)
  if (!parents[0]) throw new Error('Copyright encryption owner is unavailable')
  if (owner.kind !== 'notice') await lockCopyrightIntakeCaseLifetimes(query, [owner.id])
  const statement =
    owner.kind === 'notice'
      ? sql`/* readLiveCopyrightNoticeEncryptionKey */
      SELECT key.id FROM copyright_notice_encryption_keys owned
      JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
      JOIN copyright_notices notice ON notice.id = owned.copyright_notice_id
      WHERE owned.copyright_notice_id = ${owner.id} AND key.destroyed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erased WHERE erased.copyright_notice_id = notice.id)
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work WHERE work.copyright_notice_identity_id = notice.id AND work.erasure_started_at IS NOT NULL)
      FOR SHARE OF owned, key`
      : owner.kind === 'receipt'
        ? sql`/* readLiveCopyrightReceiptEncryptionKey */
      SELECT key.id FROM copyright_email_receipt_encryption_keys owned
      JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
      WHERE owned.copyright_notice_email_intake_receipt_id = ${owner.id} AND key.destroyed_at IS NULL
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
          WHERE receipt.id = owned.copyright_notice_email_intake_receipt_id AND receipt.final_explanation_erasure_started_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          JOIN copyright_notice_minimal_purge_continuations work ON work.copyright_notice_identity_id = link.copyright_notice_id
          WHERE link.copyright_notice_email_intake_receipt_id = owned.copyright_notice_email_intake_receipt_id AND work.erasure_started_at IS NOT NULL)
      FOR SHARE OF owned, key`
        : sql`/* readLiveCopyrightIntakeEncryptionKey */
      SELECT key.id FROM copyright_email_intake_encryption_keys owned
      JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
      JOIN copyright_notice_email_intakes intake ON intake.id = owned.copyright_notice_email_intake_id
      WHERE owned.copyright_notice_email_intake_id = ${owner.id} AND key.destroyed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          JOIN copyright_notice_minimal_purge_continuations work ON work.copyright_notice_identity_id = link.copyright_notice_id
          WHERE link.copyright_notice_email_intake_receipt_id = intake.id AND work.erasure_started_at IS NOT NULL)
      FOR SHARE OF owned, key`
  const { rows } = await query<{ id: string }>(statement)
  if (!rows[0]) throw new Error('Copyright encryption owner key is unavailable')
  return rows[0].id
}

export async function resolveCopyrightEncryptionOwner(
  subject: CopyrightEncryptionSubject,
  query: TransactionQuery,
): Promise<CopyrightEncryptionOwner> {
  if (subject.kind === 'notice' || subject.kind === 'intake' || subject.kind === 'receipt')
    return subject
  const statements = {
    submission: sql`/* resolveCopyrightSubmissionEncryptionOwner */ SELECT copyright_notice_id FROM copyright_notice_submissions WHERE id = ${subject.id}`,
    restriction: sql`/* resolveCopyrightRestrictionEncryptionOwner */ SELECT copyright_notice_id FROM copyright_restrictions WHERE id = ${subject.id}`,
    form_intake: sql`/* resolveCopyrightFormEncryptionOwner */ SELECT copyright_notice_id FROM copyright_notice_form_intakes WHERE id = ${subject.id}`,
    delivery: sql`/* resolveCopyrightDeliveryEncryptionOwner */ SELECT copyright_notice_id, copyright_notice_email_intake_receipt_id FROM copyright_notice_delivery_work_items WHERE id = ${subject.id}`,
    redress_request: sql`/* resolveCopyrightRedressEncryptionOwner */ SELECT copyright_notice_id FROM copyright_territorial_redress_requests WHERE id = ${subject.id}`,
  }
  const { rows } = await query<{
    copyright_notice_id: string | null
    copyright_notice_email_intake_receipt_id?: string | null
  }>(statements[subject.kind])
  const row = rows[0]
  if (row?.copyright_notice_id) return { kind: 'notice', id: row.copyright_notice_id }
  if (row?.copyright_notice_email_intake_receipt_id)
    return { kind: 'intake', id: row.copyright_notice_email_intake_receipt_id }
  throw new Error('Copyright encryption subject has no live owner')
}
