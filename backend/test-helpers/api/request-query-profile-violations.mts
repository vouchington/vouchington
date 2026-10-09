// The response `finish` handler runs after the test's request resolves and must not throw into
// the server, so unbaselined repeats are recorded here and `vitest.setup.request-query-profile.mts`
// fails the running test from `afterEach`. State lives on globalThis because `vi.resetModules()`
// re-evaluates this module for server.mts while the setup file keeps its original instance.

const STATE_KEY = '__vouchaRequestQueryProfileViolations'
// Bounded so projects that serve requests without the draining setup file cannot grow it.
export const MAX_RECORDED_QUERY_PROFILE_VIOLATIONS = 20

type ViolationsGlobal = typeof globalThis & { [STATE_KEY]?: string[] }

function violations(): string[] {
  const state = globalThis as ViolationsGlobal
  state[STATE_KEY] ??= []
  return state[STATE_KEY]
}

export function recordRequestQueryProfileViolation(message: string): void {
  const recorded = violations()
  recorded.push(message)
  recorded.splice(0, Math.max(0, recorded.length - MAX_RECORDED_QUERY_PROFILE_VIOLATIONS))
}

export function takeRequestQueryProfileViolations(): string[] {
  return violations().splice(0)
}
