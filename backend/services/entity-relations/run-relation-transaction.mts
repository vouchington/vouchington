import { beginTransaction, withTransactionOptions, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'

export async function runRelationTransaction<T>(
  options: QueryOptions | undefined,
  run: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  if (options?.query || options?.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
