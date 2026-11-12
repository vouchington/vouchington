import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Exercise an owned intake page under the production isolation and real commit lifecycle. */
export async function withCopyrightEmailErasureTransaction<Result>(
  operation: (transaction: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  await using transaction = await beginTransaction({ isolationLevel: 'serializable' })
  const result = await operation(transaction)
  await transaction.commit()
  return result
}
