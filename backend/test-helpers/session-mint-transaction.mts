import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** A mint can join this real caller-owned transaction but cannot settle it. */
export async function withRolledBackSessionMint<Result>(
  mint: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  const result = await mint(query)
  await query.rollback()
  return result
}
