import { constants } from 'node:os'

const WATCHED = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

export type WatchedSignal = (typeof WATCHED)[number]

export interface SignalSource {
  off: (event: WatchedSignal, listener: () => void) => unknown
  on: (event: WatchedSignal, listener: () => void) => unknown
}

export interface SignalWatch {
  /** Aborted with the signal name as its reason when the first watched signal arrives. */
  abort: AbortSignal
  dispose: () => void
}

/**
 * Turns termination signals into an abort so the deleted test files are restored before the
 * process exits. Registering a handler cancels Node's default exit, and repeated signals are
 * ignored on purpose: a second Ctrl-C must not kill the process halfway through the restore.
 */
export function watchSignals(source: SignalSource = process): SignalWatch {
  const controller = new AbortController()
  const listeners = WATCHED.map(name => {
    const listener = () => {
      if (!controller.signal.aborted) controller.abort(name)
    }
    source.on(name, listener)
    return [name, listener] as const
  })
  return {
    abort: controller.signal,
    dispose: () => {
      for (const [name, listener] of listeners) source.off(name, listener)
    },
  }
}

const isWatched = (name: unknown): name is WatchedSignal => WATCHED.some(item => item === name)

/** The conventional shell exit status for death by signal: 128 plus the signal number. */
export const exitCodeForSignal = (name: unknown): number =>
  128 + constants.signals[isWatched(name) ? name : 'SIGTERM']
