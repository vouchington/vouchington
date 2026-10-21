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
  // The runtime owns the unref'd timer behind AbortSignal.timeout, so the deadline is an abort
  // event to await rather than a timer this helper schedules or must clear.
  const signal = AbortSignal.timeout(deadlineMs)
  const listener = new AbortController()
  const deadline = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        reject(new SetupPhaseDeadlineError(phase, deadlineMs))
      },
      { once: true, signal: listener.signal },
    )
  })
  try {
    return await Promise.race([run(), deadline])
  } finally {
    listener.abort()
  }
}
