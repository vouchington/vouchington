import {
  beginTransaction,
  type QueryInput,
  type QueryValues,
  type TransactionQuery,
} from '@data-stores/psql'

/** Run two owned transactions after both have read the absent case. Each commits independently. */
export async function runTwoTransactionsAfterEmptyReadForTest<Result>(
  queryMarker: string,
  operation: (query: TransactionQuery, index: 0 | 1) => Promise<Result>,
): Promise<[Result, Result]> {
  if (!/^\/\* [^*]+ \*\/$/.test(queryMarker))
    throw new Error('Concurrent read barrier requires an exact leading query annotation')

  let releaseBarrier!: () => void
  const barrier = new Promise<void>(resolve => {
    releaseBarrier = resolve
  })
  let arrivals = 0
  let released = false
  const release = () => {
    if (released) return
    released = true
    releaseBarrier()
  }

  async function runOne(index: 0 | 1): Promise<Result> {
    try {
      await using transaction = await beginTransaction()
      let sawRead = false
      const query = Object.assign(
        async (input: QueryInput, values?: QueryValues) => {
          const result = await transaction(input, values)
          const text = typeof input === 'string' ? input : input.text
          if (!text.trimStart().startsWith(queryMarker)) return result
          if (sawRead) throw new Error('Concurrent read barrier saw a repeated query')
          sawRead = true
          if (result.rows.length !== 0)
            throw new Error('Concurrent read barrier expected no existing case')
          arrivals += 1
          if (arrivals === 2) release()
          await barrier
          return result
        },
        { client: transaction.client },
      ) as TransactionQuery
      const result = await operation(query, index)
      if (!sawRead) throw new Error('Concurrent read barrier did not see its target query')
      await transaction.commit()
      return result
    } catch (err) {
      release()
      throw err
    }
  }

  const [first, second] = await Promise.allSettled([runOne(0), runOne(1)])
  if (first.status === 'rejected') throw first.reason
  if (second.status === 'rejected') throw second.reason
  if (arrivals !== 2) throw new Error('Concurrent read barrier did not release two readers')
  return [first.value, second.value]
}
