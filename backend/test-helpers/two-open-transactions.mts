import { beginTransaction } from '@data-stores/psql'

type OpenTransaction = Awaited<ReturnType<typeof beginTransaction>>

/** Open two independent transactions for a lock-interleaving test; the caller commits them. */
export async function withTwoOpenTransactionsForTest<Result>(
  run: (first: OpenTransaction, second: OpenTransaction) => Promise<Result>,
): Promise<Result> {
  await using first = await beginTransaction()
  await using second = await beginTransaction()
  return await run(first, second)
}
