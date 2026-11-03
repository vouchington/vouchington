import { vi } from 'vitest'
import * as psql from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql'

/**
 * Wrap transactions opened through `psql.beginTransaction` (only the next one when `once`) with
 * `wrap`; returns the restore.
 */
export function interceptPostgresTransactionsForTest(
  wrap: (transaction: Awaited<ReturnType<typeof psql.beginTransaction>>) => QueryExecutor,
  once = false,
): () => void {
  const realBegin = psql.beginTransaction
  const spy = vi.spyOn(psql, 'beginTransaction')
  const intercept = async (options?: Parameters<typeof realBegin>[0]) =>
    wrap(await realBegin(options)) as Awaited<ReturnType<typeof realBegin>>
  if (once) spy.mockImplementationOnce(intercept)
  else spy.mockImplementation(intercept)
  return () => spy.mockRestore()
}

/**
 * Rewrite the rows a default-pool transaction statement returns when its text contains `marker`
 * and its bound values satisfy `matchesValues`; the statement itself still runs. Use to make real
 * code observe state that cannot be stored, such as a row that vanished mid-run; returns the restore.
 */
export function rewritePostgresTransactionRowsForTest(
  marker: string,
  matchesValues: (values: readonly unknown[]) => boolean,
  rewrite: (rows: Record<string, unknown>[]) => Record<string, unknown>[],
): () => void {
  return interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        async apply(target, thisArgument, argumentsList: Parameters<QueryExecutor>) {
          const result = await Reflect.apply(target, thisArgument, argumentsList)
          const [input] = argumentsList
          const text = typeof input === 'string' ? input : input.text
          const values = typeof input === 'string' ? [] : (input.values ?? [])
          if (!text.includes(marker) || !matchesValues(values)) return result
          const rows = rewrite(result.rows as Record<string, unknown>[])
          return { ...result, rows, rowCount: rows.length }
        },
      }),
  )
}

/**
 * Run `effect` right after the next default-pool transaction commits, then behave normally. Use to
 * change configuration or environment in the window between a claim and the work after it;
 * returns the restore.
 */
export function afterNextPostgresCommitForTest(effect: () => void): () => void {
  return interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        get(target, property) {
          if (property !== 'commit') return Reflect.get(target, property)
          return async () => {
            await target.commit()
            effect()
          }
        },
      }),
    true,
  )
}
