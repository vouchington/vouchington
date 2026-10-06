/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must observe every test across every project (root-level setupFiles merge
   additively into each project's own setupFiles under `extends: true`), so it cannot be wrapped
   in a describe block. */
import { afterEach, vi } from 'vitest'
import { checkAndRestoreFakeTimers } from './vitest-fake-timer-guard.ts'
import {
  consumeTestNetworkAllowlistViolation,
  installTestNetworkAllowlist,
} from './vitest-network-allowlist.ts'

// Node and jsdom have the builtin hook. The Storybook browser bundle does not.
if (typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function') {
  installTestNetworkAllowlist()
}

// Escape hatch for a run where the heuristic misfires — see docs/development/tests.md.
const guardDisabled = process.env.VITEST_FAKE_TIMER_GUARD === 'off'

afterEach(context => {
  // Consume even when the timer guard is off so a violation cannot leak into the next test.
  const networkMessage = consumeTestNetworkAllowlistViolation()
  const timerMessage = guardDisabled
    ? null
    : checkAndRestoreFakeTimers(vi, context.task.fullTestName)
  if (timerMessage) throw new Error(timerMessage)
  if (networkMessage) throw new Error(networkMessage)
})
