import { vi } from 'vitest'

export function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

export async function loadSubject() {
  const onGracefulShutdownValkey = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const onGracefulShutdownPSQL = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

  const mod = await import('./index.mts')
  const onGracefulShutdown = (signal: string) =>
    mod.onGracefulShutdown(signal, { onGracefulShutdownValkey, onGracefulShutdownPSQL })
  const gracefulShutdown = (deps: { logger?: (...args: unknown[]) => void } = {}) =>
    mod.gracefulShutdown({ onGracefulShutdownValkey, onGracefulShutdownPSQL, ...deps })

  return {
    ...mod,
    onGracefulShutdown,
    gracefulShutdown,
    onGracefulShutdownValkey,
    onGracefulShutdownPSQL,
  }
}

export const SIGNAL_LISTENERS_REGISTERED = Symbol.for('voucha.graceful-shutdown.signal-listeners')

// The two NODE_ENV='production' tests in index.test.mts must set that env var before loadSubject()
// to exercise the force-exit timer, but index.mts gates its real SIGTERM/SIGINT registration on
// that same env var — so loading it there also attaches real process-level listeners for the rest
// of this fork's life (vi.resetModules() re-runs the module's top level, but does not undo prior
// side effects). Left uncleaned, this would silently re-enable the SIGKILL-on-teardown hijack the
// gate in index.mts exists to remove, for whichever fork happens to run this file. Snapshot before
// and remove only what loadSubject() added, so other listeners already on the process are untouched.
export function snapshotSignalListeners() {
  return {
    sigterm: process.listeners('SIGTERM'),
    sigint: process.listeners('SIGINT'),
  }
}

export function restoreSignalListeners(before: ReturnType<typeof snapshotSignalListeners>) {
  // index.mts's registration guard is a truthy check, so `false` resets it exactly like the
  // unregistered/never-imported state — no `delete`, per the no-delete-property policy.
  ;(globalThis as Record<symbol, boolean>)[SIGNAL_LISTENERS_REGISTERED] = false
  for (const listener of process.listeners('SIGTERM')) {
    if (!before.sigterm.includes(listener)) {
      process.removeListener('SIGTERM', listener as NodeJS.SignalsListener)
    }
  }
  for (const listener of process.listeners('SIGINT')) {
    if (!before.sigint.includes(listener)) {
      process.removeListener('SIGINT', listener as NodeJS.SignalsListener)
    }
  }
}
