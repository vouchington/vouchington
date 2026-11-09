import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Commit one household admission on its own transaction. A throw rolls the insert back. */
export async function commitHouseholdAdmissionForTest<T>(
  admit: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  const result = await admit(transaction)
  await transaction.commit()
  return result
}
