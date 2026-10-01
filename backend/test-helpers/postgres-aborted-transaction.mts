import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Exercise borrowed-query services against an actual PostgreSQL-aborted transaction. */
export async function withAbortedPostgresTransactionForTest<Result>(
  operation: (options: { query: TransactionQuery }) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  try {
    await query(sql`/* withAbortedPostgresTransactionForTest */ SELECT 1 / 0`)
    throw new Error('PostgreSQL unexpectedly accepted division by zero')
  } catch (err) {
    if (!(err instanceof Error) || !('code' in err) || err.code !== '22012') throw err
  }
  // Disposal rolls back this owned transaction, even when the service propagates 25P02.
  return await operation({ query })
}
