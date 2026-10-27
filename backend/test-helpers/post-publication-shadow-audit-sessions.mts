import { addAbortListener } from 'node:events'
import { onTestFinished } from 'vitest'
import { advisoryLockPool, beginTransaction, writePool, type PoolClient } from '@data-stores/psql'
import { FAST_TEST_STATEMENT_TIMEOUT_MS } from './statement-timeout-constant.mts'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'

type AuditSessions = { observer: PoolClient; contender: PoolClient; holder?: PoolClient }
export type AuditTransaction = Awaited<ReturnType<typeof beginTransaction>>
export type AuditOutcome<Value> = { ok: true; value: Value } | { ok: false; err: unknown }

/** Reserve the observer before writer slots; drain the run before disposing any borrowed client. */
export async function withAuditSessions<Result>(
  signal: AbortSignal,
  needsHolder: boolean,
  run: (sessions: AuditSessions) => Promise<Result>,
): Promise<Result> {
  const finished = Promise.withResolvers<void>()
  onTestFinished(() => finished.promise)
  try {
    await using resources = new AsyncDisposableStack()
    const borrow = async (pool: typeof writePool) => {
      signal.throwIfAborted()
      const client = await pool.connect()
      resources.defer(() => client.release(true))
      signal.throwIfAborted()
      return client
    }
    const observer = await borrow(advisoryLockPool)
    const contender = await borrow(writePool)
    const holder = needsHolder ? await borrow(writePool) : undefined
    signal.throwIfAborted()
    return await run({ observer, contender, holder })
  } finally {
    finished.resolve()
  }
}

export function auditOutcome<Value>(pending: Promise<Value>): Promise<AuditOutcome<Value>> {
  return pending.then(
    value => ({ ok: true, value }),
    (err: unknown) => ({ ok: false, err }),
  )
}

/** Preserve every failure, preferring the actual operation rejection as cause when one exists. */
export function assertAuditOutcomes(
  operation: AuditOutcome<unknown>,
  supporting: readonly AuditOutcome<unknown>[],
  message: string,
): void {
  const errors = supporting.flatMap(result => (result.ok ? [] : [result.err]))
  if (!operation.ok) errors.unshift(operation.err)
  if (errors.length) {
    throw new AggregateError(errors, message, {
      cause: operation.ok ? errors[0] : operation.err,
    })
  }
}

/** Register on the actual reserved contender before it starts its transaction. */
export async function prepareAuditLockObservation(
  holderPid: number,
  key: string,
  client: PoolClient,
  observer: AuditTransaction,
) {
  const { rows } = await observer<{ lock_tag: string }>(
    `/* identifyShadowAuditLock */
      SELECT 'advisory lock [' || database::text || ',' || classid::text || ',' ||
        objid::text || ',' || objsubid::text || ']' AS lock_tag
      FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND granted
        AND mode = 'ExclusiveLock' AND objsubid = 1
        AND classid::bigint = ((hashtextextended($2, 0) >> 32) & 4294967295)
        AND objid::bigint = (hashtextextended($2, 0) & 4294967295)`,
    [holderPid, key],
  )
  const lockTag = rows[0]?.lock_tag
  if (!lockTag || rows.length !== 1) throw new Error('Missing exact owned shadow-audit lock')
  const observation = observeTestAdvisoryLockNotice(client, lockTag)
  return {
    ...observation,
    lockTag,
    [Symbol.asyncDispose]: () => observation.close(),
  }
}

type AuditLockObservation = Awaited<ReturnType<typeof prepareAuditLockObservation>>

export async function observeAuditWait(
  observation: AuditLockObservation,
  holderPid: number,
  contenderPid: number,
  marker: string,
  observer: AuditTransaction,
  operation: Promise<unknown>,
  signal: AbortSignal,
): Promise<void> {
  const session = await observation.ready
  if (session.processId !== contenderPid) throw new Error('Shadow-audit contender changed sessions')
  const cancelled = Promise.withResolvers<never>()
  using listener = addAbortListener(signal, () => cancelled.reject(signal.reason))
  void listener
  if (signal.aborted) cancelled.reject(signal.reason)
  await Promise.race([observation.wait(Promise.allSettled([operation])), cancelled.promise])
  signal.throwIfAborted()
  await observer('/* clearShadowAuditWaitSnapshot */ SELECT pg_stat_clear_snapshot()')
  const { rows } = await observer<{ waiting: boolean }>(
    `/* proveShadowAuditNativeWait */
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity activity
        WHERE activity.pid = $1 AND activity.application_name = $2
          AND activity.state = 'active' AND activity.query LIKE $3
          AND EXISTS (SELECT 1 FROM pg_locks queued
            WHERE queued.pid = activity.pid AND queued.locktype = 'advisory'
              AND NOT queued.granted
              AND 'advisory lock [' || queued.database::text || ',' || queued.classid::text || ',' ||
                queued.objid::text || ',' || queued.objsubid::text || ']' = $4)
          AND $5 = ANY(pg_blocking_pids(activity.pid))) AS waiting`,
    [contenderPid, session.applicationName, `%${marker}%`, observation.lockTag, holderPid],
  )
  signal.throwIfAborted()
  if (!rows[0]?.waiting) throw new Error('Shadow-audit notice did not retain its exact blocker')
}

export async function configureBoundedContender(query: AuditTransaction): Promise<number> {
  await query('/* configureShadowAuditContender */ SELECT set_config($1, $2, true)', [
    'statement_timeout',
    String(FAST_TEST_STATEMENT_TIMEOUT_MS),
  ])
  const value = await statementBudget(query)
  if (value !== FAST_TEST_STATEMENT_TIMEOUT_MS) throw new Error('Audit contender budget mismatch')
  return value
}

export async function reusableSessionBudget(client: PoolClient): Promise<number> {
  await using next = await beginTransaction({ client })
  const restored = await statementBudget(next)
  await next.rollback()
  return restored
}

/** Restore session settings before inspecting a subsequent borrowed transaction's budget. */
export async function restoreAuditSessionBudget(
  observation: AuditLockObservation,
  client: PoolClient,
): Promise<number> {
  await observation.close()
  return reusableSessionBudget(client)
}

async function statementBudget(query: AuditTransaction): Promise<number> {
  const { rows } = await query<{ timeout_ms: number }>(
    `/* readShadowAuditStatementBudget */ SELECT setting::integer AS timeout_ms
     FROM pg_settings WHERE name = 'statement_timeout'`,
  )
  if (!rows[0]) throw new Error('Missing PostgreSQL statement budget')
  return rows[0].timeout_ms
}
