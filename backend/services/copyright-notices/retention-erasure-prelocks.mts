import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'
import { COPYRIGHT_RETENTION_ERASURE } from './retention-erasure-spec.mts'
import type { CopyrightErasureWork } from './retention-erasure-progress.mts'

type ErasureLocks = { intakeIds: string[]; tokenIds: string[]; stage: number; table: number }

/** Capped SES/token locks precede the parent, matching ingestion. Initial admission locks no leaves. */
export async function lockCopyrightErasurePageBeforeParent(
  query: TransactionQuery,
  noticeId: string,
  work: CopyrightErasureWork | undefined,
  pageSize: number,
): Promise<ErasureLocks> {
  const result: ErasureLocks = {
    intakeIds: [],
    tokenIds: [],
    stage: work?.erasure_stage_index ?? -1,
    table: work?.erasure_table_index ?? -1,
  }
  if (!work?.erasure_started_at) return result
  if (work.erasure_stage_index === 0) {
    const { rows } = await query<{
      id: string
      amazon_ses_message_id: string
    }>(sql`/* selectCopyrightErasureIdentityLocks */
      SELECT intake.id, intake.amazon_ses_message_id FROM copyright_notice_email_intake_notice_links link
      JOIN copyright_notice_email_intake_receipts intake ON intake.id = link.copyright_notice_email_intake_receipt_id
      WHERE link.copyright_notice_id = ${noticeId}
        AND (${work.erasure_intake_cursor}::uuid IS NULL OR intake.id > ${work.erasure_intake_cursor}::uuid)
      ORDER BY intake.id LIMIT ${pageSize}`)
    result.intakeIds = rows.map(row => row.id)
    await query(sql`/* lockCopyrightErasureIdentityPage */
      SELECT pg_advisory_xact_lock(hashtextextended(identity, 0)) FROM (
        SELECT 'copyright-email:' || identity AS identity FROM unnest(${rows.map(row => row.amazon_ses_message_id)}::text[]) source(identity)
        ORDER BY identity) ordered`)
  }
  const spec = COPYRIGHT_RETENTION_ERASURE[work.erasure_table_index]
  if (work.erasure_stage_index === 2 && spec?.table === 'copyright_notice_email_thread_tokens') {
    const { rows } = await query<{ id: string; lookup_digest: string }>(
      copyrightErasureTokenPageSql(noticeId, pageSize),
    )
    result.tokenIds = rows.map(row => row.id)
    await lockCopyrightEmailThreadTokens(
      query,
      rows.map(row => row.lookup_digest),
    )
  }
  return result
}

export function copyrightErasureTokenPageSql(noticeId: string, pageSize: number) {
  const spec = COPYRIGHT_RETENTION_ERASURE.find(
    entry => entry.table === 'copyright_notice_email_thread_tokens',
  )!
  return sql`/* selectCopyrightErasureTokenLockPage */ SELECT id, lookup_digest FROM copyright_notice_email_thread_tokens WHERE `.append(
    spec.scope(noticeId),
  )
    .append(sql` AND lookup_digest <> encode(sha256(convert_to('erased:' || id::text, 'UTF8')), 'hex')
      ORDER BY id LIMIT ${pageSize}`)
}
