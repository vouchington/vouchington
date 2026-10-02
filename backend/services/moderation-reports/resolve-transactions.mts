import { beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function runInOwnedTransaction<T>(
  run: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
export async function lockModerationCases(caseIds: string[], options: QueryOptions): Promise<void> {
  const ids = [...new Set(caseIds)]
  if (ids.length === 0) return
  await write(
    sql`/* lockModerationCases */ SELECT id FROM moderation_cases WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`,
    options,
  )
}
