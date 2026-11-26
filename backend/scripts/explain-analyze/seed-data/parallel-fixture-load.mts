import { availableParallelism } from 'node:os'
import { beginTransaction, read } from '@data-stores/psql'

export type FixtureTransaction = Awaited<ReturnType<typeof beginTransaction>>

const MAX_LOAD_WORKERS = 8
/** Overrides the worker count; 1 reproduces the former serial load for comparison runs. */
export const FIXTURE_LOAD_WORKERS_ENV = 'EXPLAIN_FIXTURE_LOAD_WORKERS'

export function fixtureLoadWorkerCount(env: string | undefined): number {
  const requested = Number(env)
  if (Number.isInteger(requested) && requested >= 1) return Math.min(requested, MAX_LOAD_WORKERS)
  return Math.min(Math.max(availableParallelism(), 1), MAX_LOAD_WORKERS)
}

/**
 * One instant for every row of a fixture. A serial load took it from its single transaction;
 * parallel transactions would each take their own, so the loader captures it once and passes it.
 */
export async function captureFixtureInstant(): Promise<string> {
  const { rows } = await read<{ instant: string }>(
    `/* captureFixtureInstant */ SELECT now()::text AS instant`,
  )
  const instant = rows[0]?.instant
  if (!instant) throw new Error('The database returned no fixture instant')
  return instant
}

/**
 * Run independent tasks on separate connections. Every task owns a disjoint key range, so the
 * resulting rows and values match a serial load, and each leaf's rows go in the serial order.
 * Each worker commits after its last task. A failure stops the remaining tasks and rolls back the
 * workers still open, but a worker that already finished stays committed, so the caller's
 * disposable database must be recreated after any failure.
 */
export async function runInParallelTransactions<Task>(
  tasks: readonly Task[],
  run: (transaction: FixtureTransaction, task: Task) => Promise<void>,
): Promise<void> {
  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    await using transaction = await beginTransaction()
    for (let index = next++; index < tasks.length && !failed; index = next++) {
      try {
        await run(transaction, tasks[index]!)
      } catch (err) {
        failed = true
        throw err
      }
    }
    if (!failed) await transaction.commit()
  }
  const workerCount = Math.min(
    fixtureLoadWorkerCount(process.env[FIXTURE_LOAD_WORKERS_ENV]),
    tasks.length,
  )
  const outcomes = await Promise.allSettled(Array.from({ length: workerCount }, worker))
  for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason
}

export function logFixtureLoadPhase(label: string, startedAt: number): number {
  const now = performance.now()
  console.log(`${label}: ${Math.round(now - startedAt)} ms`)
  return now
}
