import { setTimeout as delay } from 'node:timers/promises'

/**
 * Upper bound for one backend global-setup phase. Normal phases finish in seconds, even under
 * coverage on a contended runner; the step timeout is 10 minutes. A phase still pending here is
 * stuck, and failing it names the phase instead of letting the step stall until the watchdog
 * reports only that no test file ever started (run 39552270690).
 */
export const SETUP_PHASE_DEADLINE_MS = 120_000

export class SetupPhaseDeadlineError extends Error {
  constructor(phase: string, deadlineMs: number) {
    super(
      `Backend global setup phase "${phase}" did not settle within ${deadlineMs}ms; no worker or test file had started.`,
    )
    this.name = 'SetupPhaseDeadlineError'
  }
}

export async function withSetupPhaseDeadline<T>(
  phase: string,
  run: () => Promise<T>,
  deadlineMs: number = SETUP_PHASE_DEADLINE_MS,
): Promise<T> {
  // A referenced timer, unlike AbortSignal.timeout's unref'd one, keeps the process alive while a
  // handle-less phase is pending, so the deadline fires instead of the process exiting 0. It is
  // cancelled once the race settles; a cancelled deadline never settles, so nothing is left to
  // reject unhandled.
  const cancel = new AbortController()
  const deadline = delay(deadlineMs, undefined, { signal: cancel.signal }).then(
    () => {
      throw new SetupPhaseDeadlineError(phase, deadlineMs)
    },
    () => new Promise<never>(() => {}),
  )
  try {
    return await Promise.race([run(), deadline])
  } finally {
    cancel.abort()
  }
}
