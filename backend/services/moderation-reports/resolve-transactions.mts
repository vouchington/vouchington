import { beginTransaction, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

export async function runInOwnedTransaction<T>(
  run: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}

export async function runReportResolutionTransaction<T>(
  options: QueryOptions | undefined,
  run: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  try {
    return options?.query || options?.client
      ? await withTransactionOptions(options, run)
      : await runInOwnedTransaction(run)
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '40P01') {
      throw createHttpError(409, 'Report changed concurrently. Try again.', { cause: err })
    }
    throw err
  }
}

// Keep case writers ahead of report/cluster writes, matching report FK checks.
export async function lockModerationCases(
  caseIds: string[],
  query: TransactionQuery,
): Promise<void> {
  const ids = [...new Set(caseIds)]
  if (ids.length === 0) return
  await query(
    sql`/* lockModerationCases */ SELECT id FROM moderation_cases WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`,
  )
}
