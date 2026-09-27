import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'

export async function runEntityRelationNotificationTestTransaction<Result>(
  operation: (transaction: OwnedTransaction) => Promise<Result>,
  options: { commit?: boolean } = {},
): Promise<Result> {
  await using transaction = await beginTransaction()
  const result = await operation(transaction)
  if (options.commit) await transaction.commit()
  return result
}
