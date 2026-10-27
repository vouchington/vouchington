import {
  beginBoundedTransaction,
  runWithTransaction,
  type TransactionQuery,
} from '@data-stores/psql'

/** Preserve provider persistence bounds while joining an owning account-change transaction. */
export async function runOAuthAccountUpsertTransaction<T>(
  query: TransactionQuery | undefined,
  handler: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  if (query) return runWithTransaction(query, handler)
  await using owned = await beginBoundedTransaction({
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 2_000,
  })
  const result = await handler(owned)
  await owned.commit()
  return result
}
