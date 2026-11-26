import { gracefulShutdownPeriodSeconds } from '@voucha/config'
import { flushSentry } from '@modules/on-error'
import { reportShutdownError } from './report-shutdown-error.mts'
import {
  createGracefulShutdown,
  createShutdownRegistry,
  shutdownForOneOffCommand,
} from '@vouchington/server-utils/graceful-shutdown'

const gracePeriodMs = gracefulShutdownPeriodSeconds * 1000

function log(...args: unknown[]) {
  if (process.env.NODE_ENV === 'test') return
  console.log(...args)
}

function logError(...args: unknown[]) {
  console.error(...args)
}

// Registered by @data-stores/psql and @data-stores/valkey at their own module load time (mirrors
// the addGracefulShutdownCallback self-registration pattern used elsewhere, e.g.
// @data-stores/analytics's graceful-shutdown.mts). This package must not import those data stores
// directly — doing so previously created a workspace dependency cycle
// (graceful-shutdown -> psql/valkey -> ... -> analytics -> graceful-shutdown).
const dataStores = createShutdownRegistry({ log })

export async function gracefulShutdown(): Promise<void> {
  const errors = await dataStores.close()
  for (const error of errors) reportShutdownError(error)
}

const runner = createGracefulShutdown({
  gracePeriodMs,
  onError: reportShutdownError,
  closeResources: gracefulShutdown,
  flush: () => flushSentry(2000),
  log,
  logError,
  // Skipped under test so Vitest forks never schedule a process.exit fallback.
  forceExit: process.env.NODE_ENV !== 'test',
})

export const addGracefulShutdownCallback = runner.addCallback
export const addGracefulShutdownDrainCallback = runner.addDrainCallback
export const onGracefulShutdown = runner.shutdown

export function registerGracefulShutdownValkey(shutdown: () => Promise<void>): void {
  dataStores.register('Valkey', shutdown)
}

export function registerGracefulShutdownPSQL(shutdown: () => Promise<void>): void {
  dataStores.register('PostgreSQL', shutdown)
}

const SIGNAL_LISTENERS_REGISTERED = Symbol.for('voucha.graceful-shutdown.signal-listeners')
const globalRef = globalThis as Record<symbol, boolean>
// Guard against re-registration under `vi.resetModules()` so tests don't accumulate
// listeners past Node's defaultMaxListeners. Tests must invoke `onGracefulShutdown()`
// directly — emitting real SIGTERM/SIGINT would hit the first-imported closure, whose
// callback arrays diverge from later re-imports.
//
// Skipped entirely under NODE_ENV === 'test': registering a SIGTERM/SIGINT listener here
// removes Node's default terminate-on-signal behavior, so every backend Vitest fork ignored
// Vitest's own SIGTERM at pool-teardown time and was force-killed with SIGKILL ~500ms later
// (Vitest's SIGKILL_TIMEOUT) — destroying whatever stderr was buffered at the time.
if (process.env.NODE_ENV !== 'test' && !globalRef[SIGNAL_LISTENERS_REGISTERED]) {
  globalRef[SIGNAL_LISTENERS_REGISTERED] = true
  runner.installSignalHandlers()
}

// One-off commands that own their pools (benchmarks, fixture preparation) close those instead of
// whatever the data-store modules registered.
export function shutdownDataStoresForOneOffCommand(
  overrides: {
    onGracefulShutdownValkey?: () => Promise<void>
    onGracefulShutdownPSQL?: () => Promise<void>
  } = {},
): Promise<void> {
  const shutdowns = {
    ...(overrides.onGracefulShutdownValkey && { Valkey: overrides.onGracefulShutdownValkey }),
    ...(overrides.onGracefulShutdownPSQL && { PostgreSQL: overrides.onGracefulShutdownPSQL }),
  }
  return shutdownForOneOffCommand({
    gracePeriodMs,
    logError,
    close: () => dataStores.close({ shutdowns, log: () => {} }),
  })
}
