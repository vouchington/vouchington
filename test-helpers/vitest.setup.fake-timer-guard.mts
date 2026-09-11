/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   afterEach hook must observe every test across every project (root-level setupFiles merge
   additively into each project's own setupFiles under `extends: true`), so it cannot be wrapped
   in a describe block. */
import { afterEach, vi } from 'vitest'
import { checkAndRestoreFakeTimers } from './vitest-fake-timer-guard.ts'

// Escape hatch for a run where the heuristic misfires — see docs/development/tests.md.
const guardDisabled = process.env.VITEST_FAKE_TIMER_GUARD === 'off'

afterEach(context => {
  if (guardDisabled) return

  const message = checkAndRestoreFakeTimers(vi, context.task.fullTestName)
  if (message) throw new Error(message)
})
