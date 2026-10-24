import { beginTransaction, type QueryOptions } from '@data-stores/psql'

/** Returns after disposing an uncommitted transaction used by the session action. */
export async function runSessionActionWithRolledBackQuery<Result>(
  action: (queryOptions: QueryOptions) => Promise<Result>,
  useClient = false,
): Promise<Result> {
  await using transaction = await beginTransaction()
  return await action(useClient ? { client: transaction.client } : { query: transaction })
}
