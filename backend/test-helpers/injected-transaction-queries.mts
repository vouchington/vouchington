import { vi } from 'vitest'
import * as psql from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql'

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
  const realBegin = psql.beginTransaction
  const spy = vi.spyOn(psql, 'beginTransaction').mockImplementation(async (...args) => {
    const transaction = await Reflect.apply(realBegin, psql, args)
    return new Proxy(transaction, {
      apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
        const [input, parameters] = argumentsList
        const statement = typeof input === 'string' ? input : input.text
        const values = typeof input === 'string' ? (parameters ?? []) : input.values
        if (!matches(statement, values)) return Reflect.apply(target, thisArgument, argumentsList)
        return intercept().then(() => Reflect.apply(target, thisArgument, argumentsList))
      },
    })
  })
  return () => spy.mockRestore()
}
