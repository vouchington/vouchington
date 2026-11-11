import type { TransactionQuery } from '@data-stores/psql/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'

const TOKEN_GC_GRACE_MS = 60 * 60 * 1000

export function copyrightEmailTokenGcCutoffId(now: Date): string {
  return getMinUUIDv7ForDate(new Date(now.getTime() - TOKEN_GC_GRACE_MS))
}

export async function deleteOrphanCopyrightEmailThreadTokens(
  transaction: TransactionQuery,
  ids: readonly string[],
  tokenGcCutoffId: string,
): Promise<number> {
  const { rowCount } = await transaction(sql`/* deleteOrphanCopyrightEmailThreadTokens */
    DELETE FROM copyright_notice_email_thread_tokens token
    WHERE token.id = ANY(${[...ids]}::uuid[])
      AND token.id < ${tokenGcCutoffId}::uuid
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_thread_references reference
        WHERE reference.token_id = token.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.matched_token_id = token.id)`)
  return rowCount ?? 0
}
