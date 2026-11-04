import { vi } from 'vitest'
import * as psql from '@data-stores/psql'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { interceptPostgresTransactionsForTest } from './injected-postgres-transactions.mts'
import { backgroundQueue } from './shared-background-queue.mts'
export { rejectNextClassifierRunDispatcherAddForTest } from './injected-classifier-queue-failures.mts'
export { rejectNextQueueJobAddForTest } from './injected-queue-failures.mts'

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

/** Reject matching pool reads outside caller-owned transactions; returns the restore. */
export function rejectPostgresReadForTest(
  marker: string,
  error: unknown,
  /** Observe the bound values of each rejected read, such as the lookup keys it was asked for. */
  onRejected: (values: readonly unknown[]) => void = () => {},
  matchesValues: (values: readonly unknown[]) => boolean = () => true,
): () => void {
  const realRead = psql.read
  const spy = vi.spyOn(psql, 'read').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    const values = typeof query === 'string' ? [] : (query.values ?? [])
    if (!text.includes(marker) || !matchesValues(values)) return realRead(query, ...rest)
    onRejected(values)
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Callers inject non-Error rejection values on purpose.
    return Promise.reject(error)
  })
  return () => spy.mockRestore()
}

/** Reject matching pool writes outside caller-owned transactions; returns the restore. */
export function rejectPostgresWriteForTest(
  marker: string,
  error: unknown,
  /** Narrow the rejection to statements bound to specific values, such as one row's id. */
  matchesValues: (values: readonly unknown[]) => boolean = () => true,
): () => void {
  const realWrite = psql.write
  const spy = vi.spyOn(psql, 'write').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    const values = typeof query === 'string' ? (rest[0] ?? []) : (query.values ?? [])
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Callers inject non-Error rejection values on purpose.
    if (text.includes(marker) && matchesValues(values)) return Promise.reject(error)
    return realWrite(query, ...rest)
  })
  return () => spy.mockRestore()
}

/** Reject the next default-pool transaction opening, then run normally; returns the restore. */
export function rejectNextPostgresTransactionForTest(error: Error): () => void {
  const spy = vi.spyOn(psql, 'beginTransaction').mockRejectedValueOnce(error)
  return () => spy.mockRestore()
}

/** Answer matching pool reads in order; exhausted answers run for real. Returns the restore. */
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

/** Answer matching pool writes in order; undefined/exhausted answers run for real. Returns the restore. */
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

/** Run each default-pool write for real, then observe its committed result. One hook per test. */
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

/** Reject the next add of one named job on the real shared queue; unrelated jobs pass through. */
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

/** Reject the next bulk admission containing one named job; unrelated admissions run for real. */
export function rejectNextBackgroundJobAddBulkForTest(jobName: string, error: Error): () => void {
  const realAddBulk = backgroundQueue.addBulk
  let rejected = false
  const spy = vi.spyOn(backgroundQueue, 'addBulk').mockImplementation(jobs => {
    if (!rejected && jobs.some(job => job.name === jobName)) {
      rejected = true
      return Promise.reject(error)
    }
    return Reflect.apply(realAddBulk, backgroundQueue, [jobs])
  })
  return () => spy.mockRestore()
}

/** Observe a named job's real acceptance, including reply loss injected by throwing from after. */
export function runAfterBackgroundJobAddForTest(
  jobName: string,
  after: (data: unknown, job: unknown) => Promise<void>,
): () => void {
  const realAdd = backgroundQueue.add
  const spy = vi.spyOn(backgroundQueue, 'add').mockImplementation(async (name, data, opts) => {
    const job = await Reflect.apply(realAdd, backgroundQueue, [name, data, opts])
    if (name === jobName) await after(data, job)
    return job
  })
  return () => spy.mockRestore()
}

/** Run a one-shot hook inside the real transaction before a matching statement. */
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
export { loseNextPsqlJobAddReplyForTest } from './injected-psql-failures.mts'
