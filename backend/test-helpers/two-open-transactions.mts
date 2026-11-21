import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Open two independent transactions for a lock-interleaving test; the caller commits them. */
export async function withTwoOpenTransactionsForTest<Result>(
  run: (first: TransactionQuery, second: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  await using first = await beginTransaction()
  await using second = await beginTransaction()
  return await run(first, second)
}
