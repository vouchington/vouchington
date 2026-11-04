import { vi } from 'vitest'
import * as psql from '@data-stores/psql'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
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
export function rejectPostgresReadForTest(
  marker: string,
  error: unknown,
  /** Observe the bound values of each rejected read, such as the lookup keys it was asked for. */
  onRejected: (values: readonly unknown[]) => void = () => {},
): () => void {
  const realRead = psql.read
  const spy = vi.spyOn(psql, 'read').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    if (!text.includes(marker)) return realRead(query, ...rest)
    onRejected(typeof query === 'string' ? [] : (query.values ?? []))
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Callers inject non-Error rejection values on purpose.
    return Promise.reject(error)
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
 * Answer default-pool `write()` calls whose statement text contains `marker` from `answers`, in call
 * order: an array entry replaces that call's rows without running the statement, `undefined` and
 * calls past the end of the list run the real write. Use to make one call report a state the
 * database still disagrees with, such as a lease renewal that matched no row; returns the restore.
 */
export function answerPostgresWritesForTest(
  marker: string,
  answers: ReadonlyArray<Record<string, unknown>[] | undefined>,
): () => void {
  const realWrite = psql.write
  let calls = 0
  const spy = vi.spyOn(psql, 'write').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    if (!text.includes(marker)) return realWrite(query, ...rest)
    const rows = answers[calls++]
    if (!rows) return realWrite(query, ...rest)
    return Promise.resolve({ command: 'UPDATE', rowCount: rows.length, oid: 0, fields: [], rows })
  })
  return () => spy.mockRestore()
}

/**
 * Run every default-pool `write()` for real, then call `after` with its statement text, bound
 * values and result once it settles. Use to act exactly when a write has committed instead of
 * waiting on timing. Install at most one write hook per test, because they replace each other;
 * returns the restore.
 */
export function runAfterPostgresWriteForTest(
  after: (
    statement: string,
    values: readonly unknown[],
    result: { rowCount: number | null; rows: readonly Record<string, unknown>[] },
  ) => void,
): () => void {
  const realWrite = psql.write
  const spy = vi.spyOn(psql, 'write').mockImplementation(async (query, ...rest) => {
    const result = await realWrite(query, ...rest)
    if (typeof query === 'string') after(query, [], result)
    else after(query.text, query.values ?? [], result)
    return result
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
