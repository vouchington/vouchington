// Staging-only one-off that keeps Aurora awake: the cluster auto-pauses without a connection. The
// infrastructure-owned wake task runs it by name and stops it when done. The guard runs before
// @data-stores/psql is imported so a misconfigured task never connects to a database.
import { setTimeout as sleep } from 'node:timers/promises'
import {
  assertStagingAuroraWakeAllowed,
  parseStagingAuroraWakeSeconds,
} from './staging-aurora-wake-guard.mts'

/* c8 ignore start -- process entrypoint exercised by the compiled image smoke tests. */
const QUERY_INTERVAL_MS = 30 * 1000

function ignoreStopSignal(err: Error): void {
  if (err.name !== 'AbortError') throw err
}

assertStagingAuroraWakeAllowed()
const seconds = parseStagingAuroraWakeSeconds(process.argv.slice(2))
// The task is PID 1, which gets no default SIGTERM disposition, so the wait must stop explicitly.
const stop = new AbortController()
process.once('SIGTERM', () => stop.abort())
process.once('SIGINT', () => stop.abort())
const { write, onGracefulShutdown } = await import('@data-stores/psql')
const deadline = Date.now() + seconds * 1000
let queried = false
while (!stop.signal.aborted && Date.now() < deadline) {
  try {
    // oxlint-disable-next-line no-await-in-loop -- one connection attempt per interval until the deadline
    await write('/* stagingAuroraWake */ SELECT 1')
    queried = true
  } catch (err) {
    // The first attempts can land while Aurora is still resuming.
    console.error('staging wake query failed', err)
  }
  // oxlint-disable-next-line no-await-in-loop -- the next attempt waits for the interval or the deadline
  await sleep(Math.min(QUERY_INTERVAL_MS, Math.max(0, deadline - Date.now())), undefined, {
    signal: stop.signal,
  }).catch(ignoreStopSignal)
}
await onGracefulShutdown()
// A task that never reached the database did not keep Aurora awake, so it must not report success.
if (!queried) {
  console.error('staging wake never completed a query')
  process.exitCode = 1
}
/* c8 ignore stop */
