import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'

/** Take ingestion's digest locks before the bounded token-row page is locked. */
export async function lockCopyrightOrphanTokenDigests(
  transaction: TransactionQuery,
  ids: readonly string[],
): Promise<void> {
  const { rows } = await transaction<{ lookup_digest: string }>(sql`
    /* readCopyrightOrphanTokenPageDigests */
    SELECT lookup_digest FROM copyright_notice_email_thread_tokens
    WHERE id = ANY(${[...ids]}::uuid[])`)
  await lockCopyrightEmailThreadTokens(
    transaction,
    rows.map(row => row.lookup_digest),
  )
}
