import { vi } from 'vitest'
import * as psql from '@data-stores/psql'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import {
  answerPostgresReadsForTest as answerTargetPostgresReads,
  answerPostgresWritesForTest as answerTargetPostgresWrites,
  beforePostgresTransactionQueryForTest as beforeTargetTransactionQuery,
  rejectNextPostgresTransactionForTest as rejectNextTargetTransaction,
  rejectPostgresReadForTest as rejectTargetPostgresRead,
  rejectPostgresWriteForTest as rejectTargetPostgresWrite,
  rejectQuery as rejectTargetQuery,
  runAfterPostgresWriteForTest as runAfterTargetPostgresWrite,
  withRejectedPostgresQueryForTest as withRejectedTargetPostgresQuery,
  type CallableSqlQueryExecutor,
  type ManagedSqlTransaction,
  type ReadQueryTarget,
  type TransactionBeginTarget,
  type WriteQueryTarget,
} from 'vouchington-tooling/postgres-test-faults'
import { backgroundQueue } from './shared-background-queue.mts'
export { rejectNextClassifierRunDispatcherAddForTest } from './injected-classifier-queue-failures.mts'
export {
  rejectNextQueueJobAddForTest,
  rejectQueueJobAddForTest,
  rejectQueueJobAddBulkForTest,
  rejectNextBackgroundJobAddForTest,
  rejectNextBackgroundJobAddBulkForTest,
} from './injected-queue-failures.mts'

/**
 * Reject one write made through a caller-owned executor while preserving its transaction.
 * Adapts `@vouchington/postgres`'s `SQLStatement`-based `QueryExecutor` to upstream's generic
 * `CallableSqlQueryExecutor` type.
 */
export function rejectQuery<Query extends QueryExecutor>(
  query: Query,
  matches: (statement: string, values: readonly unknown[]) => boolean,
  message: string | Error,
): Query {
  return rejectTargetQuery(
    query as unknown as CallableSqlQueryExecutor,
    matches,
    message,
  ) as unknown as Query
}

/** Inject one write failure through a caller-owned real PostgreSQL transaction. */
export function withRejectedPostgresQueryForTest<Result>(
  matches: (statement: string, values: readonly unknown[]) => boolean,
  message: string,
  operation: (query: QueryExecutor) => Promise<Result>,
): Promise<Result> {
  return withRejectedTargetPostgresQuery(
    beginTransaction as unknown as () => Promise<ManagedSqlTransaction>,
    matches,
    message,
    query => operation(query as unknown as QueryExecutor),
  )
}

/** Reject matching pool reads outside caller-owned transactions; returns the restore. */
export function rejectPostgresReadForTest(
  marker: string,
  error: unknown,
  /** Observe the bound values of each rejected read, such as the lookup keys it was asked for. */
  onRejected: (values: readonly unknown[]) => void = () => {},
  matchesValues: (values: readonly unknown[]) => boolean = () => true,
): () => void {
  return rejectTargetPostgresRead(
    psql as unknown as ReadQueryTarget,
    marker,
    error,
    onRejected,
    matchesValues,
  )
}

/** Reject matching pool writes outside caller-owned transactions; returns the restore. */
export function rejectPostgresWriteForTest(
  marker: string,
  error: unknown,
  /** Narrow the rejection to statements bound to specific values, such as one row's id. */
  matchesValues: (values: readonly unknown[]) => boolean = () => true,
): () => void {
  return rejectTargetPostgresWrite(
    psql as unknown as WriteQueryTarget,
    marker,
    error,
    matchesValues,
  )
}

/** Reject the next default-pool transaction opening, then run normally; returns the restore. */
export function rejectNextPostgresTransactionForTest(error: Error): () => void {
  return rejectNextTargetTransaction(psql as unknown as TransactionBeginTarget, error)
}

/** Answer matching pool reads in order; exhausted answers run for real. Returns the restore. */
export function answerPostgresReadsForTest(
  marker: string,
  answers: ReadonlyArray<Record<string, unknown>[]>,
): () => void {
  return answerTargetPostgresReads(psql as unknown as ReadQueryTarget, marker, answers)
}

/** Answer matching pool writes in order; undefined/exhausted answers run for real. Returns the restore. */
export function answerPostgresWritesForTest(
  marker: string,
  answers: ReadonlyArray<Record<string, unknown>[] | undefined>,
): () => void {
  return answerTargetPostgresWrites(psql as unknown as WriteQueryTarget, marker, answers)
}

/** Run each default-pool query for real, then await its observer before returning the result. */
export function runAfterPostgresWriteForTest(
  after: (
    statement: string,
    values: readonly unknown[],
    result: { rowCount: number | null; rows: readonly Record<string, unknown>[] },
  ) => void | Promise<void>,
): () => void {
  return runAfterTargetPostgresWrite(psql as unknown as WriteQueryTarget, after)
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
  return beforeTargetTransactionQuery(
    psql.psql as unknown as TransactionBeginTarget,
    marker,
    () => true,
    transaction => beforeStatement(transaction as unknown as QueryExecutor),
  )
}
export { loseNextPsqlJobAddReplyForTest } from './injected-psql-failures.mts'
