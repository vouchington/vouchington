import type pg from 'pg'
import { write } from './clients.mts'
import { withTransactionOptions } from './setup.mts'
import type { QueryExecutor, QueryInput, QueryValues, TransactionQuery } from './types.mts'

/**
 * Recover a failed SQL scope without poisoning the caller's retained transaction executor.
 * PostgreSQL shadows nested savepoints with this name; releasing the inner restores the outer.
 * The caller owns transaction commit and every provider effect outside this SQL scope.
 */
export async function withTransactionSavepoint<Result>(
  query: TransactionQuery,
  operation: (scope: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const execute: QueryExecutor = <Row extends pg.QueryResultRow = pg.QueryResultRow>(
    input: QueryInput,
    values?: QueryValues,
  ) => write<Row>(input, values, { client: query.client })
  const scope = Object.assign(execute, { client: query.client })
  await scope('/* withTransactionSavepoint:begin */ SAVEPOINT voucha_recoverable_scope')
  try {
    return await withTransactionOptions({ query: scope }, async joined => {
      const result = await operation(joined)
      await scope(
        '/* withTransactionSavepoint:release */ RELEASE SAVEPOINT voucha_recoverable_scope',
      )
      return result
    })
  } catch (err) {
    let recoveryFailure: { error: unknown } | undefined
    try {
      await scope(
        '/* withTransactionSavepoint:rollback */ ROLLBACK TO SAVEPOINT voucha_recoverable_scope',
      )
      await scope(
        '/* withTransactionSavepoint:release */ RELEASE SAVEPOINT voucha_recoverable_scope',
      )
    } catch (cleanupErr) {
      recoveryFailure = { error: cleanupErr }
    }
    if (recoveryFailure)
      throw new AggregateError(
        [err, recoveryFailure.error],
        'Transaction savepoint recovery failed',
        { cause: err },
      )
    throw err
  }
}
