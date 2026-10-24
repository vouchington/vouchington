import { beginTransaction } from '@data-stores/psql'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import type { QueryExecutor } from '@data-stores/psql/types'

/** Freeze the global quota baseline while a test adds only its own rollback-owned rows. */
export async function withEmbeddingQuotaSnapshot<T>(
  run: (query: QueryExecutor) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  await transaction(allowUnannotatedQuery('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'))
  return await run(transaction)
}
