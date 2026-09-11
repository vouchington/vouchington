// Split out of vitest-fork-exit-sentinel.mts to keep that file under the repo's 200-line cap. The
// fault injector is a distinct concern from the sentinel it exercises: registerForkExitSentinel()
// is the always-on production code every fork runs; everything here only ever runs from
// vitest-fork-exit-sentinel.integration.test.mts's fixture project, gated by
// VITEST_FORK_CRASH_INJECT.
//
// No 'exit' mode: that would mean deliberately calling process.exit(), which is exactly the call
// Vitest's module runner permanently stubs to throw (see vitest-fork-exit-sentinel.mts's header
// comment) — there is no way to inject it that isn't either a no-op (reallyExit skips the 'exit'
// listener the mode exists to exercise) or a synthesized process.emit('exit', ...), which oxlint's
// no-restricted-properties rule already bans repo-wide ("Do not synthesize process signals; call
// the shutdown handler directly."). It also wouldn't model anything real: ForksPoolWorker.stop()
// (cli-api.BK8pd4xc.js) always tears a fork down via fork.kill(), i.e. SIGTERM, so a clean fork
// dies by signal, not by calling its own process.exit() — confirmed by running a real, fully
// passing backend fork and observing its only sentinel line read `mode=signal:SIGTERM code=143`.
// The integration spec's happy-path case exercises that real teardown directly, with no injection.
const FORK_CRASH_INJECT_MODES = ['oom', 'abort', 'sigkill', 'throw', 'reject'] as const
export type ForkCrashInjectMode = (typeof FORK_CRASH_INJECT_MODES)[number]

// Mirrors the VITEST_FORK_LEAK_DETECTION === 'off' precedent (vitest.setup.fork-leak-detection.mts):
// an exact allowlist, inert for any other value including unset. Used only by the integration spec
// (vitest-fork-exit-sentinel.integration.test.mts) to prove each death mode is distinguishable.
export function requestedForkCrashInjectMode(): ForkCrashInjectMode | null {
  const value = process.env.VITEST_FORK_CRASH_INJECT ?? ''
  return (FORK_CRASH_INJECT_MODES as readonly string[]).includes(value)
    ? (value as ForkCrashInjectMode)
    : null
}

export function injectForkCrash(mode: ForkCrashInjectMode): void {
  if (mode === 'sigkill') {
    // Unhandleable by design — simulates an external OOM-killer term. The sentinel must NOT
    // produce a line for this mode; that absence is the assertion the integration spec makes.
    // oxlint-disable-next-line no-restricted-properties -- fault injector for the integration spec; this signal is unhandleable by design, so it cannot route through onGracefulShutdown()
    process.kill(process.pid, 'SIGKILL')
  }
  if (mode === 'abort') {
    // Deterministically reproducing a genuine V8/NAPI fatal error isn't portable across CI
    // hosts. Writing a real diagnostic report (populating a genuine nativeStack) and then
    // aborting natively reproduces the observable signature a real native crash leaves behind:
    // no sentinel line, but a report with a populated native stack.
    process.report?.writeReport()
    process.abort()
  }
  if (mode === 'oom') {
    // Exhausts the actual V8 old-space heap (plain retained JS values, not off-heap Buffers) so
    // this is a genuine V8 OOM, not a simulation. The fixture project pairs this with a small
    // --max-old-space-size via execArgv so the limit is reached in milliseconds.
    const retained: unknown[][] = []
    for (;;) {
      retained.push(new Array(1_000_000).fill(0))
    }
  }
  if (mode === 'throw') {
    // Scheduled rather than thrown here directly: a throw inside injectForkCrash() would unwind
    // through the beforeAll hook that calls it, which Vitest's own test runner catches as a failed
    // hook — never reaching process.on('uncaughtException') at all. A macrotask callback throws
    // outside any call stack Vitest controls, which is what a real production uncaught exception
    // does too (confirmed against the two occurrences this mode exists to cover, PR #9076's
    // backend-tests (1) and PR #9080's backend-tests (2) — both single, unexplained mode=uncaught
    // deaths with no OOM signature).
    setTimeout(() => {
      throw new Error('injected uncaught exception for vitest-fork-exit-sentinel integration test')
    }, 0)
  }
  if (mode === 'reject') {
    // Same rationale as 'throw': scheduled so the rejection is genuinely unhandled by the time
    // Node checks, rather than synchronously rejecting inside a hook Vitest might attach its own
    // handling to.
    setTimeout(() => {
      void Promise.reject(
        new Error('injected unhandled rejection for vitest-fork-exit-sentinel integration test'),
      )
    }, 0)
  }
}
