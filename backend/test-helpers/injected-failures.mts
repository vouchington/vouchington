import { beginTransaction, type QueryExecutor } from '@data-stores/psql'

/** Reject one write made through a caller-owned executor while preserving its transaction. */
export function rejectQuery<Query extends QueryExecutor>(
  query: Query,
  matches: (statement: string, values: readonly unknown[]) => boolean,
  message: string | Error,
): Query {
  return new Proxy(query, {
    apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
      const [input, parameters] = argumentsList
      const statement = typeof input === 'string' ? input : input.text
      const values = typeof input === 'string' ? (parameters ?? []) : input.values
      if (matches(statement, values))
        throw typeof message === 'string' ? new Error(message) : message
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  })
}

/** Inject one write failure through a caller-owned real PostgreSQL transaction. */
export async function withRejectedPostgresQueryForTest<Result>(
  matches: (statement: string, values: readonly unknown[]) => boolean,
  message: string,
  operation: (query: QueryExecutor) => Promise<Result>,
): Promise<Result> {
  await using transaction = await beginTransaction()
  return await operation(rejectQuery(transaction, matches, message))
}
