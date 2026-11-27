import * as psql from '@data-stores/psql'
import {
  interceptPostgresTransactionQueriesForTest as interceptTargetTransactionQueries,
  type TransactionBeginTarget,
} from 'vouchington-tooling/postgres-test-faults'

/**
 * Run `intercept` before every statement of a default-pool `beginTransaction()` transaction that
 * `matches`, then run the statement for real. Throwing from `intercept` fails that statement
 * through the real transaction; awaiting a competing real write in it reproduces a race. The
 * caller owns once-only logic and ownership scoping (match owned ids in `values`). Returns the
 * restore.
 */
export function interceptPostgresTransactionQueriesForTest(
  matches: (statement: string, values: readonly unknown[]) => boolean,
  intercept: () => Promise<void>,
): () => void {
  return interceptTargetTransactionQueries(psql as unknown as TransactionBeginTarget, matches, () =>
    intercept(),
  )
}
