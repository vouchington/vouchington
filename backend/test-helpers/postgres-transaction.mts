import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Give a borrowed-query service a real transaction that always rolls back on disposal. */
export async function withPostgresTransactionForTest<Result>(
  operation: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  return await operation(query)
}
