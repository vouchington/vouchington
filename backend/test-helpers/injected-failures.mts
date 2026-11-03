import { vi } from 'vitest'
import * as psql from '@data-stores/psql'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { backgroundQueue } from './shared-background-queue.mts'

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

/**
 * Reject default-pool `read()` calls whose statement text contains `marker` (the leading SQL
 * comment label). Use only for reads outside any caller-owned transaction; returns the restore.
 */
export function rejectPostgresReadForTest(marker: string, error: unknown): () => void {
  const realRead = psql.read
  const spy = vi.spyOn(psql, 'read').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Callers inject non-Error rejection values on purpose.
    if (text.includes(marker)) return Promise.reject(error)
    return realRead(query, ...rest)
  })
  return () => spy.mockRestore()
}

/**
 * Reject default-pool `write()` calls whose statement text contains `marker` (the leading SQL
 * comment label). Use only for writes outside any caller-owned transaction; returns the restore.
 */
export function rejectPostgresWriteForTest(
  marker: string,
  error: unknown,
  /** Narrow the rejection to statements bound to specific values, such as one row's id. */
  matchesValues: (values: readonly unknown[]) => boolean = () => true,
): () => void {
  const realWrite = psql.write
  const spy = vi.spyOn(psql, 'write').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    const values = typeof query === 'string' ? [] : (query.values ?? [])
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Callers inject non-Error rejection values on purpose.
    if (text.includes(marker) && matchesValues(values)) return Promise.reject(error)
    return realWrite(query, ...rest)
  })
  return () => spy.mockRestore()
}

/**
 * Reject the next default-pool `beginTransaction()` call, then behave normally. Use when the code
 * under test opens its own first transaction after only non-transactional work; returns the restore.
 */
export function rejectNextPostgresTransactionForTest(error: Error): () => void {
  const spy = vi.spyOn(psql, 'beginTransaction').mockRejectedValueOnce(error)
  return () => spy.mockRestore()
}

/**
 * Answer default-pool `read()` calls whose statement text contains `marker` from `answers`, in call
 * order: each entry replaces that call's rows, and calls past the end of the list run the real read.
 * Use to make a read observe state from before a concurrent write; returns the restore.
 */
export function answerPostgresReadsForTest(
  marker: string,
  answers: ReadonlyArray<Record<string, unknown>[]>,
): () => void {
  const realRead = psql.read
  let calls = 0
  const spy = vi.spyOn(psql, 'read').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    if (!text.includes(marker)) return realRead(query, ...rest)
    const rows = answers[calls++]
    if (!rows) return realRead(query, ...rest)
    return Promise.resolve({ command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows })
  })
  return () => spy.mockRestore()
}

/**
 * Reject the next `add` of one job name on the real shared background queue, then behave
 * normally. Other jobs added meanwhile (entity listeners, for example) pass through untouched;
 * returns the restore.
 */
export function rejectNextBackgroundJobAddForTest(jobName: string, error: Error): () => void {
  const realAdd = backgroundQueue.add
  let rejected = false
  const spy = vi.spyOn(backgroundQueue, 'add').mockImplementation((name, data, opts) => {
    if (!rejected && name === jobName) {
      rejected = true
      return Promise.reject(error)
    }
    return Reflect.apply(realAdd, backgroundQueue, [name, data, opts])
  })
  return () => spy.mockRestore()
}

/**
 * Wrap transactions opened through `psql.beginTransaction` (only the next one when `once`) with
 * `wrap`; returns the restore.
 */
function interceptPostgresTransactionsForTest(
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
 * While installed, wrap every transaction opened through `psql.beginTransaction`. Run
 * `beforeStatement` once, on the first statement (in whichever transaction reaches it) whose text
 * contains `marker`, immediately before that statement. The callback receives that
 * transaction's executor, so a lifecycle change it writes is visible to the statement that follows,
 * as a concurrent commit between two statements would be; a throw rejects that statement. Returns
 * the restore.
 */
export function runBeforePostgresStatementForTest(
  marker: string,
  beforeStatement: (transaction: QueryExecutor) => Promise<void>,
): () => void {
  let ran = false
  return interceptPostgresTransactionsForTest(
    transaction =>
      new Proxy(transaction, {
        apply(target, thisArgument, argumentsList: Parameters<typeof transaction>) {
          const [input] = argumentsList
          const text = typeof input === 'string' ? input : input.text
          if (ran || !text.includes(marker))
            return Reflect.apply(target, thisArgument, argumentsList)
          ran = true
          return (async () => {
            await beforeStatement(target)
            return Reflect.apply(target, thisArgument, argumentsList)
          })()
        },
      }),
  )
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
