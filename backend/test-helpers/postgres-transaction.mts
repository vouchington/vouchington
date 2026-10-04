import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Give a borrowed-query service a real transaction that always rolls back on disposal. */
export async function withPostgresTransactionForTest<Result>(
  operation: (query: TransactionQuery) => Promise<Result>,
  afterQuery?: { marker: string; complete: () => void },
): Promise<Result> {
  await using query = await beginTransaction()
  if (!afterQuery) return await operation(query)
  const observed = Object.assign(
    async (input: Parameters<TransactionQuery>[0], values?: Parameters<TransactionQuery>[1]) => {
      const result = await query(input, values)
      const text = typeof input === 'string' ? input : input.text
      if (text.includes(afterQuery.marker)) afterQuery.complete()
      return result
    },
    { client: query.client },
  ) as TransactionQuery
  return await operation(observed)
}
