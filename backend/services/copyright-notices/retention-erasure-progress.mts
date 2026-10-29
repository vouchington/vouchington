import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_RETENTION_ERASURE } from './retention-erasure-spec.mts'
import {
  copyrightErasureCandidateSql,
  eraseCopyrightRetentionTableSql,
} from './retention-erasure-update-sql.mts'
import { destroyCopyrightOwnerEncryptionKey } from './encryption-key-destruction.mts'

export type CopyrightErasureWork = {
  erasure_started_at: Date | null
  erasure_legal_clock_at: Date | null
  erasure_stage_index: number
  erasure_table_index: number
  erasure_intake_cursor: string | null
  erasure_object_owner_cursor: string | null
  erased_object_count: number
}

export async function readCopyrightErasureWork(
  query: TransactionQuery,
  noticeId: string,
): Promise<CopyrightErasureWork> {
  const { rows } = await query<CopyrightErasureWork>(sql`/* readCopyrightErasureWork */
    SELECT erasure_started_at, erasure_legal_clock_at, erasure_stage_index, erasure_table_index,
      erasure_intake_cursor, erasure_object_owner_cursor, erased_object_count
    FROM copyright_notice_minimal_purge_continuations WHERE copyright_notice_identity_id = ${noticeId}`)
  if (!rows[0]) throw new Error('Copyright erasure continuation is missing')
  return rows[0]
}

/** One raw intake page. The caller acquired these exact SES identity locks before the case lock. */
export async function fenceCopyrightErasureIntakePage(
  query: TransactionQuery,
  noticeId: string,
  work: CopyrightErasureWork,
  pageSize: number,
  lockedIntakeIds: readonly string[],
): Promise<void> {
  const { rows } = await query<{ id: string }>(sql`/* fenceCopyrightErasureIntakePage */
    SELECT intake.id FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notice_email_intake_receipts intake ON intake.id = link.copyright_notice_email_intake_receipt_id
    WHERE link.copyright_notice_id = ${noticeId}
      AND (${work.erasure_intake_cursor}::uuid IS NULL OR intake.id > ${work.erasure_intake_cursor}::uuid)
    ORDER BY intake.id LIMIT ${pageSize + 1}`)
  const page = rows.slice(0, pageSize)
  if (page.some(row => !lockedIntakeIds.includes(row.id)))
    throw new Error('Copyright intake identity fence changed while locking')
  await query(sql`/* retainErasedCopyrightEmailIdentityPage */
    UPDATE copyright_notice_email_intake_receipts SET erased_at = COALESCE(erased_at, CURRENT_TIMESTAMP)
    WHERE id = ANY(${page.map(row => row.id)}::uuid[])`)
  await query(sql`/* checkpointCopyrightErasureIntakePage */ UPDATE copyright_notice_minimal_purge_continuations
    SET erasure_intake_cursor = ${rows.length > pageSize ? page.at(-1)?.id : null}::uuid,
      erasure_stage_index = ${rows.length > pageSize ? 0 : 1}
    WHERE copyright_notice_identity_id = ${noticeId}`)
}

/** One fixed-table overwrite page; the next phase is durable only when the selected table drained. */
export async function redactCopyrightErasurePage(
  query: TransactionQuery,
  noticeId: string,
  work: CopyrightErasureWork,
  pageSize: number,
  tokenIds: readonly string[],
  tokenHasMore: boolean,
): Promise<void> {
  const spec = COPYRIGHT_RETENTION_ERASURE[work.erasure_table_index]
  if (!spec) {
    if (work.erasure_table_index !== COPYRIGHT_RETENTION_ERASURE.length)
      throw new Error('Invalid copyright erasure manifest phase')
    await query(sql`/* finishCopyrightCiphertextErasure */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_stage_index = 3, erasure_table_index = 0 WHERE copyright_notice_identity_id = ${noticeId}`)
    return
  }
  if (spec.intakeOwnerColumn) {
    const { rows: owners } = await query<{ id: string }>(
      sql`/* selectCopyrightRedactionIntakeLifetimes */
      SELECT DISTINCT `
        .append(spec.intakeOwnerColumn)
        .append(' AS id FROM (')
        .append(copyrightErasureCandidateSql(spec, noticeId, pageSize))
        .append(') raw ORDER BY id'),
    )
    await query(sql`/* lockCopyrightRedactionIntakeLifetimes */ SELECT id FROM copyright_notice_email_intake_receipts
      WHERE id = ANY(${owners.map(row => row.id)}::uuid[]) ORDER BY id FOR UPDATE`)
  }
  const { rows } = await query<{ scanned: number; updated: number }>(
    eraseCopyrightRetentionTableSql(
      spec,
      noticeId,
      pageSize,
      spec.table === 'copyright_notice_email_thread_tokens' ? tokenIds : undefined,
    ),
  )
  const result = rows[0]
  if (!result || result.scanned > pageSize + 1 || result.updated > pageSize)
    throw new Error('Copyright erasure page exceeded its bound')
  if (result.scanned <= pageSize && result.updated === result.scanned && !tokenHasMore)
    await query(sql`/* checkpointCopyrightCiphertextErasure */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_table_index = erasure_table_index + 1 WHERE copyright_notice_identity_id = ${noticeId}`)
}

/** One intake key per page; destruction uses the same lifetime lock as every decrypting reader. */
export async function destroyCopyrightErasureKeyPage(
  query: TransactionQuery,
  noticeId: string,
  work: CopyrightErasureWork,
): Promise<void> {
  const { rows } = await query<{ id: string }>(sql`/* selectCopyrightIntakeKeyDestructionPage */
    SELECT intake.id FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notice_email_intake_receipts intake ON intake.id = link.copyright_notice_email_intake_receipt_id
    WHERE link.copyright_notice_id = ${noticeId}
      AND (${work.erasure_intake_cursor}::uuid IS NULL OR intake.id > ${work.erasure_intake_cursor}::uuid)
    ORDER BY intake.id LIMIT 1 FOR UPDATE OF intake`)
  const intake = rows[0]
  if (intake) {
    await destroyCopyrightOwnerEncryptionKey(
      { kind: work.erasure_table_index === 0 ? 'intake' : 'receipt', id: intake.id },
      query,
    )
    await query(sql`/* checkpointCopyrightIntakeKeyDestruction */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_intake_cursor = ${intake.id} WHERE copyright_notice_identity_id = ${noticeId}`)
  } else if (work.erasure_table_index === 0) {
    await query(sql`/* advanceCopyrightReceiptKeyDestruction */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_table_index = 1, erasure_intake_cursor = NULL WHERE copyright_notice_identity_id = ${noticeId}`)
  } else {
    await destroyCopyrightOwnerEncryptionKey({ kind: 'notice', id: noticeId }, query)
    await query(sql`/* finishCopyrightOwnerKeyDestruction */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_stage_index = 4 WHERE copyright_notice_identity_id = ${noticeId}`)
  }
}
