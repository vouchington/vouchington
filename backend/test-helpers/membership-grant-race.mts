import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { QueryInput, QueryValues } from '@data-stores/psql/types'

/** Let both grant writers decide to activate before either inserts an activation. */
export async function runMembershipGrantsAfterActivationDecisionForTest<Result>(
  operation: (query: TransactionQuery) => Promise<Result>,
): Promise<PromiseSettledResult<Result>[]> {
  const arrived = Promise.withResolvers<void>()
  let arrivals = 0

  async function runOne(): Promise<Result> {
    try {
      await using transaction = await beginTransaction()
      let sawActivation = false
      const query = Object.assign(
        async (input: QueryInput, values?: QueryValues) => {
          const text = typeof input === 'string' ? input : input.text
          if (text.trimStart().startsWith('/* createMembership: grant activation */')) {
            if (sawActivation) throw new Error('Expected one grant activation attempt')
            sawActivation = true
            arrivals += 1
            if (arrivals === 2) arrived.resolve()
            await arrived.promise
          }
          return transaction(input, values)
        },
        { client: transaction.client },
      ) as TransactionQuery
      const result = await withTransactionOptions({ query: transaction }, () => operation(query))
      if (!sawActivation) throw new Error('Grant writer skipped the activation attempt')
      await transaction.commit()
      return result
    } catch (err) {
      arrived.resolve()
      throw err
    }
  }

  return Promise.allSettled([runOne(), runOne()])
}
