import { beginTransaction, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import createHttpError from 'http-errors'

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
