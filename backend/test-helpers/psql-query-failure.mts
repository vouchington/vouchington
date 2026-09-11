import {
  beginTransaction,
  type QueryInput,
  type QueryOptions,
  type QueryValues,
  type TransactionQuery,
} from '@data-stores/psql'

export async function withForcedTransactionRollbackForTest(
  handler: (options: QueryOptions) => Promise<unknown>,
): Promise<never> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await handler({ query })
    throw new Error('Injected transaction rollback for test')
  }
}

export async function withFailingTransactionQueryOptionsForTest<Result>(
  annotation: string,
  handler: (options: QueryOptions) => Promise<Result>,
): Promise<Result> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    const failingQuery = Object.assign(
      (input: QueryInput, values?: QueryValues) => {
        const text = typeof input === 'string' ? input : input.text
        if (text.includes(`/* ${annotation} */`)) {
          throw new Error(`Injected query failure for ${annotation}`)
        }
        return query(input, values)
      },
      { client: query.client },
    ) as TransactionQuery

    const result = await handler({ query: failingQuery })
    await transaction.commit()
    return result
  }
}
