import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

export type OperationDuringClientUpdate<T> = { clientId: string; start: () => Promise<T> }

/** The reader completes against committed metadata while an unrelated client update is pending. */
export async function duringTestOAuthClientUpdate<T>(
  input: OperationDuringClientUpdate<T>,
  update: (transaction: TransactionQuery) => Promise<unknown>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await update(transaction)
  const result = await input.start()
  await transaction.commit()
  return result
}
