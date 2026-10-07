import { beginTransaction, withTransactionOptions } from './setup.mts'
import type { TransactionQuery } from './types.mts'

/** Join a caller's transaction or own and commit one after all writes succeed. */
export async function runWithTransaction<Result>(
  query: TransactionQuery | undefined,
  handler: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  if (query) return withTransactionOptions({ query }, handler)
  await using transaction = await beginTransaction()
  const result = await handler(transaction)
  await transaction.commit()
  return result
}
