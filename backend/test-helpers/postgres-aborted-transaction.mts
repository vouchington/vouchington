import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { abortTestPostgresTransaction } from 'vouchington-tooling/postgres-test-faults'

/** Exercise borrowed-query services against an actual PostgreSQL-aborted transaction. */
export async function withAbortedPostgresTransactionForTest<Result>(
  operation: (options: { query: TransactionQuery }) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  await abortTestPostgresTransaction(query.client)
  // Disposal rolls back this owned transaction, even when the service propagates 25P02.
  return await operation({ query })
}
