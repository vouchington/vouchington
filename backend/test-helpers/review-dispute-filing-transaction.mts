import type { QueryExecutor, TransactionQuery } from '@data-stores/psql'
import { withCommittedPostgresTransactionForTest } from './postgres-transaction.mts'

/** Runs a competing write immediately after the real filing transaction reads the review. */
export function withReviewDisputeReadInterleavingForTest<Result>(
  operation: (query: TransactionQuery) => Promise<Result>,
  afterReviewRead: () => Promise<void>,
): Promise<Result> {
  return withCommittedPostgresTransactionForTest(query => {
    const observed: QueryExecutor = async <Row extends Record<string, unknown>>(
      ...[input, values]: Parameters<QueryExecutor>
    ) => {
      const result = await query<Row>(input, values)
      const statement = typeof input === 'string' ? input : input.text
      if (statement.startsWith('/* createReviewDispute:getPost */')) await afterReviewRead()
      return result
    }
    return operation(Object.assign(observed, { client: query.client }))
  })
}
