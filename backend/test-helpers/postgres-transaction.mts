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

/** Commit an owned service transaction after assertions inside its callback. */
export async function withCommittedPostgresTransactionForTest<Result>(
  operation: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  const result = await operation(query)
  await query.commit()
  return result
}

/** Keep a stable snapshot while a separate transaction changes the test fixture. */
export async function withRepeatableReadPostgresTransactionForTest<Result>(
  operation: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction({ isolationLevel: 'repeatable read' })
  return await operation(query)
}

export function beforeBorrowedPostgresQueryForTest(
  query: TransactionQuery,
  marker: string,
  effect: () => Promise<void>,
): TransactionQuery {
  let applied = false
  return new Proxy(query, {
    async apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
      const [input] = argumentsList
      const statement = typeof input === 'string' ? input : input.text
      if (!applied && statement.includes(marker)) {
        applied = true
        await effect()
      }
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  })
}
