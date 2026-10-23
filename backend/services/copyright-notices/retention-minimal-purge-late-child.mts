import { beginBoundedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Only the scoped parent DELETE guard emits this SQLSTATE. */
export function isLateCopyrightChild(err: unknown): err is { code: 'PZ421' } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'PZ421'
}

/** The failed page is rolled back before the next bounded sweep revisits leaf phases. */
export async function restartCopyrightMinimalPurgeAfterLateChild(noticeId: string): Promise<void> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await transaction(sql`/* restartCopyrightMinimalPurgeAfterLateChildGuard */
    UPDATE copyright_notice_minimal_purge_continuations SET phase_index = 0
    WHERE copyright_notice_identity_id = ${noticeId} AND root_purged_at IS NULL`)
  await transaction.commit()
}
