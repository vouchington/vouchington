import { addAbortListener } from 'node:events'
import { onTestFinished } from 'vitest'
import { advisoryLockPool, beginTransaction, writePool, type PoolClient } from '@data-stores/psql'
import { FAST_TEST_STATEMENT_TIMEOUT_MS } from './statement-timeout-constant.mts'
import { waitForTestPostgresLockWaiter } from './postgres-lock-wait.mts'

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

export async function observeAuditWait(
  holderPid: number,
  contenderPid: number,
  marker: string,
  observer: AuditTransaction,
  operation: Promise<unknown>,
  signal: AbortSignal,
): Promise<void> {
  const cancellation = new AbortController()
  using listener = addAbortListener(signal, () => cancellation.abort(signal.reason))
  void listener
  const stop = () => cancellation.abort(new Error('Audit operation ended'))
  void operation.then(stop, stop)
  if (signal.aborted) cancellation.abort(signal.reason)
  await waitForTestPostgresLockWaiter(
    holderPid,
    marker,
    observer,
    undefined,
    cancellation.signal,
    contenderPid,
  )
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

export async function statementBudget(query: AuditTransaction): Promise<number> {
  const { rows } = await query<{ timeout_ms: number }>(
    `/* readShadowAuditStatementBudget */ SELECT setting::integer AS timeout_ms
     FROM pg_settings WHERE name = 'statement_timeout'`,
  )
  if (!rows[0]) throw new Error('Missing PostgreSQL statement budget')
  return rows[0].timeout_ms
}

export async function reusableSessionBudget(client: PoolClient): Promise<number> {
  await using next = await beginTransaction({ client })
  const restored = await statementBudget(next)
  await next.rollback()
  return restored
}
