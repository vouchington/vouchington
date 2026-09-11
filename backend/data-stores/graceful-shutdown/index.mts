import { gracefulShutdownPeriodSeconds } from '@voucha/config'
import onError, { flushSentry } from '@modules/on-error'

type ConnectionShutdown = () => Promise<void>

const noopConnectionShutdown: ConnectionShutdown = async () => {}

const callbacks: (() => Promise<void>)[] = []
const drainCallbacks: (() => Promise<void>)[] = []
let shuttingDown = false
let gracefulShutdownValkeyRegistered = false

// Registered by @data-stores/psql and @data-stores/valkey at their own module load time (mirrors
// the addGracefulShutdownCallback self-registration pattern used elsewhere, e.g.
// @data-stores/analytics's graceful-shutdown.mts). This package must not import those data stores
// directly — doing so previously created a workspace dependency cycle
// (graceful-shutdown -> psql/valkey -> ... -> analytics -> graceful-shutdown).
let registeredValkeyShutdown: ConnectionShutdown = noopConnectionShutdown
let registeredPSQLShutdown: ConnectionShutdown = noopConnectionShutdown

export function registerGracefulShutdownValkey(shutdown: ConnectionShutdown): void {
  registeredValkeyShutdown = shutdown
  gracefulShutdownValkeyRegistered = true
}

export function registerGracefulShutdownPSQL(shutdown: ConnectionShutdown): void {
  registeredPSQLShutdown = shutdown
}

interface GracefulShutdownDeps {
  onGracefulShutdownValkey?: ConnectionShutdown
  onGracefulShutdownPSQL?: ConnectionShutdown
  logger?: (...args: unknown[]) => void
}

type OneOffShutdownDeps = Omit<GracefulShutdownDeps, 'logger'>

export function addGracefulShutdownCallback(callback: () => Promise<void>): number {
  return callbacks.push(callback)
}

export function addGracefulShutdownDrainCallback(callback: () => Promise<void>): number {
  return drainCallbacks.push(callback)
}

export function isGracefulShutdownValkeyRegistered(): boolean {
  return gracefulShutdownValkeyRegistered
}

const SIGNAL_LISTENERS_REGISTERED = Symbol.for('voucha.graceful-shutdown.signal-listeners')
const globalRef = globalThis as Record<symbol, boolean>
// Guard against re-registration under `vi.resetModules()` so tests don't accumulate
// listeners past Node's defaultMaxListeners. Tests must invoke `onGracefulShutdown()`
// directly — emitting real SIGTERM/SIGINT would hit the first-imported closure, whose
// `callbacks`/`drainCallbacks` arrays diverge from later re-imports.
//
// Skipped entirely under NODE_ENV === 'test': registering a SIGTERM/SIGINT listener here
// removes Node's default terminate-on-signal behavior, so every backend Vitest fork ignored
// Vitest's own SIGTERM at pool-teardown time and was force-killed with SIGKILL ~500ms later
// (Vitest's SIGKILL_TIMEOUT) — destroying whatever stderr was buffered at the time. Tests never
// send a real SIGTERM/SIGINT to exercise this path (see the comment above); the fork-exit
// sentinel (test-helpers/vitest-fork-exit-sentinel.mts) owns SIGTERM in forks instead and exits
// explicitly after a synchronous write, so this fires only in real deployed processes.
if (process.env.NODE_ENV !== 'test' && !globalRef[SIGNAL_LISTENERS_REGISTERED]) {
  globalRef[SIGNAL_LISTENERS_REGISTERED] = true
  process.on('SIGTERM', onGracefulShutdown)
  process.on('SIGINT', onGracefulShutdown)
}

function log(...args: unknown[]) {
  if (process.env.NODE_ENV === 'test') return
  console.log(...args)
}

export async function onGracefulShutdown(signal: string, deps: GracefulShutdownDeps = {}) {
  if (shuttingDown) return
  shuttingDown = true

  log(`Graceful Shutdown: received ${signal} signal, shutting down...`)

  // Track whether all cleanup completed so the force-exit timer uses the right code.
  let gracefulShutdownSucceeded = false

  // Fallback: if any handle (e.g., a NAPI threadsafe function from @glidemq/speedkey) keeps
  // the event loop alive after cleanup, exit after the grace period. Unref'd so it never
  // fires if the process exits naturally. Exit code 0 when shutdown succeeded, 1 when timed out.
  if (process.env.NODE_ENV !== 'test') {
    setTimeout(() => {
      if (!gracefulShutdownSucceeded) {
        console.error('Graceful Shutdown: could not close connections in time, forcing exit...')
      }
      process.exit(gracefulShutdownSucceeded ? 0 : 1)
    }, gracefulShutdownPeriodSeconds * 1000).unref()
  }

  await Promise.all(
    callbacks.map((callback: () => Promise<void>) =>
      // Wrapping `callback` in Promise.resolve().then(...) is deliberate, not an anti-pattern: it
      // guarantees .catch(onError) also catches a *synchronous* throw from `callback`, which a
      // bare `callback().catch(onError)` would not (the throw happens before .catch is reached).
      // oxlint-disable-next-line promise/no-callback-in-promise
      Promise.resolve().then(callback).catch(onError),
    ),
  )

  log('Graceful Shutdown: all callbacks completed.')

  await Promise.all(
    drainCallbacks.map((callback: () => Promise<void>) =>
      // Wrapping `callback` in Promise.resolve().then(...) is deliberate, not an anti-pattern: it
      // guarantees .catch(onError) also catches a *synchronous* throw from `callback`, which a
      // bare `callback().catch(onError)` would not (the throw happens before .catch is reached).
      // oxlint-disable-next-line promise/no-callback-in-promise
      Promise.resolve().then(callback).catch(onError),
    ),
  )

  log('Graceful Shutdown: drain phase completed.')

  await gracefulShutdown(deps)

  await flushSentry(2000)

  log('Graceful Shutdown: all connections closed.')

  // Mark success so the force-exit timer uses exit code 0 if it fires.
  // The timer fires only if NAPI handles (e.g., @glidemq/speedkey threadsafe functions)
  // keep the event loop alive after all JavaScript connections have been closed.
  gracefulShutdownSucceeded = true
}

export async function gracefulShutdown(deps: GracefulShutdownDeps = {}): Promise<void> {
  const errors = await closeDataStores(deps)
  for (const error of errors) onError(error)
}

export async function shutdownDataStoresForOneOffCommand(
  deps: OneOffShutdownDeps = {},
): Promise<void> {
  const forceExitTimer = setTimeout(() => {
    console.error('One-off shutdown: process did not terminate in time, forcing exit...')
    process.exit(1)
  }, gracefulShutdownPeriodSeconds * 1000)

  try {
    const errors = await closeDataStores({ ...deps, logger: () => {} })
    if (errors.length > 0) {
      throw new AggregateError(errors, 'One-off data-store shutdown failed')
    }
  } finally {
    // Keep the timer referenced while cleanup is pending so a stuck close cannot leave the
    // command unresolved indefinitely. Once cleanup settles, only a leaked native handle should
    // keep the process alive long enough for the fallback to fire.
    forceExitTimer.unref()
  }
}

async function closeDataStores(deps: GracefulShutdownDeps): Promise<Error[]> {
  const shutdownValkey = deps.onGracefulShutdownValkey ?? registeredValkeyShutdown
  const shutdownPSQL = deps.onGracefulShutdownPSQL ?? registeredPSQLShutdown
  const shutdownLog = deps.logger ?? log
  const results = await Promise.allSettled([
    Promise.resolve().then(shutdownValkey),
    Promise.resolve().then(shutdownPSQL),
  ])

  if (results[0].status === 'fulfilled') {
    shutdownLog('Graceful Shutdown: Valkey connection closed.')
  }
  if (results[1].status === 'fulfilled') {
    shutdownLog('Graceful Shutdown: PostgreSQL connection closed.')
  }

  return results.flatMap(result => (result.status === 'rejected' ? [toError(result.reason)] : []))
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
