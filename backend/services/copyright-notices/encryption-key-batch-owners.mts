import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightEncryptionOwner } from './encryption-key-capabilities.mts'
import { lockCopyrightIntakeCaseLifetimes } from './encryption-intake-lifetimes.mts'

/** The caller supplies its already deduplicated, runtime-capped owner batch. */
export async function readCopyrightBatchOwnerKeys(
  owners: readonly CopyrightEncryptionOwner[],
  query: TransactionQuery,
  access: 'read' | 'write',
) {
  const noticeIds = owners.flatMap(owner => (owner.kind === 'notice' ? [owner.id] : [])).toSorted()
  const intakeIds = owners.flatMap(owner => (owner.kind === 'intake' ? [owner.id] : [])).toSorted()
  const receiptIds = owners
    .flatMap(owner => (owner.kind === 'receipt' ? [owner.id] : []))
    .toSorted()
  const associatedIds = [...new Set([...intakeIds, ...receiptIds])]
  // Match erasure's notice-before-intake owner order. Writer callers already own these lifetimes.
  await lockCopyrightIntakeCaseLifetimes(query, associatedIds)
  const lifetimeLock = access === 'read' ? ' FOR SHARE' : ' FOR UPDATE'
  // ast-grep-ignore: no-three-sequential-awaits -- Notice owners precede intake owners; re-read linked cases only after intake locks to close late-association races.
  if (noticeIds.length)
    await query(
      sql`/* lockCopyrightBatchNoticeLifetimes */ SELECT id FROM copyright_notices
    WHERE id = ANY(${noticeIds}::uuid[]) ORDER BY id`.append(lifetimeLock),
    )
  if (intakeIds.length)
    await query(
      sql`/* lockCopyrightBatchIntakeLifetimes */ SELECT id FROM copyright_notice_email_intakes
    WHERE id = ANY(${intakeIds}::uuid[]) ORDER BY id`.append(lifetimeLock),
    )
  if (receiptIds.length)
    await query(
      sql`/* lockCopyrightBatchReceiptLifetimes */ SELECT id FROM copyright_notice_email_intake_receipts
    WHERE id = ANY(${receiptIds}::uuid[]) ORDER BY id`.append(lifetimeLock),
    )
  await lockCopyrightIntakeCaseLifetimes(query, associatedIds)
  const { rows } = await query<{
    id: string
    kind: CopyrightEncryptionOwner['kind']
    owner_id: string
  }>(sql`
    /* readCopyrightBatchOwnerKeys */
    SELECT key.id, 'notice'::text AS kind, owned.copyright_notice_id AS owner_id
    FROM copyright_notice_encryption_keys owned JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
    WHERE owned.copyright_notice_id = ANY(${noticeIds}::uuid[]) AND key.destroyed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erased WHERE erased.copyright_notice_id = owned.copyright_notice_id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations work WHERE work.copyright_notice_identity_id = owned.copyright_notice_id AND work.erasure_started_at IS NOT NULL)
    UNION ALL
    SELECT key.id, 'intake'::text AS kind, owned.copyright_notice_email_intake_id AS owner_id
    FROM copyright_email_intake_encryption_keys owned JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
    WHERE owned.copyright_notice_email_intake_id = ANY(${intakeIds}::uuid[]) AND key.destroyed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        JOIN copyright_notice_minimal_purge_continuations work ON work.copyright_notice_identity_id = link.copyright_notice_id
        WHERE link.copyright_notice_email_intake_receipt_id = owned.copyright_notice_email_intake_id AND work.erasure_started_at IS NOT NULL)
    UNION ALL
    SELECT key.id, 'receipt'::text AS kind, owned.copyright_notice_email_intake_receipt_id AS owner_id
    FROM copyright_email_receipt_encryption_keys owned JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
    WHERE owned.copyright_notice_email_intake_receipt_id = ANY(${receiptIds}::uuid[]) AND key.destroyed_at IS NULL
      AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
        WHERE receipt.id = owned.copyright_notice_email_intake_receipt_id AND receipt.final_explanation_erasure_started_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        JOIN copyright_notice_minimal_purge_continuations work ON work.copyright_notice_identity_id = link.copyright_notice_id
        WHERE link.copyright_notice_email_intake_receipt_id = owned.copyright_notice_email_intake_receipt_id AND work.erasure_started_at IS NOT NULL)`)
  return rows
}
