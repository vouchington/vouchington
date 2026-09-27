import type { TransientRetryRule } from './types.mts'
import {
  hasExplicitOomEvidence,
  hasGenericFailureSignal,
  hasPlaywrightFailureSignal,
  hasVitestTestFailureSignal,
} from './runner-shutdown-fingerprints.mts'
import { hasStorybookBrowserSessionConnectionTimeout } from './storybook-browser-session-rules.mts'
import {
  failedStorybookJobName,
  hasStorybookBrowserViteReady,
  hasStorybookViteOptimizerNewDepsReload,
  matchesStorybookSingleJob,
  storybookBrowserAttemptMarker,
  storybookLogJobName,
  stripAnsi,
} from './storybook-shared.mts'

// `Test Files` is intentionally broad: bootstrap timeouts must precede any test output.
const hasStorybookBrowserTestOutput = (plainLog: string): boolean =>
  plainLog.includes('|web-storybook-browser') || plainLog.includes('Test Files ')

export const storybookBrowserTestStepName = 'Run Storybook browser tests'

const hasStorybookViteServerFetchFailure = (log: string): boolean => {
  const plainLog = stripAnsi(log)
  if (hasStorybookViteOptimizerNewDepsReload(plainLog)) return false
  return (
    plainLog.includes('Failed to import test file') &&
    plainLog.includes('Failed to fetch dynamically imported module: http://localhost:')
  )
}

const hasStorybookBrowserTestTimeoutDuringViteOptimizerScan = (log: string): boolean => {
  const plainLog = stripAnsi(log)
  const browserStart = plainLog.lastIndexOf('VITEST_STORYBOOK_BROWSER: 1')
  if (browserStart === -1) return false
  const browserLog = plainLog.slice(browserStart)
  const attemptStart = browserLog.lastIndexOf(storybookBrowserAttemptMarker)
  const terminalAttempt = browserLog.slice(attemptStart === -1 ? 0 : attemptStart)
  return (
    terminalAttempt.includes('[vite] (client) [optimizer] scanning dependencies') &&
    terminalAttempt.includes(`The action '${storybookBrowserTestStepName}' has timed out after`) &&
    !hasStorybookBrowserTestOutput(terminalAttempt) &&
    !hasPlaywrightFailureSignal(terminalAttempt) &&
    !hasVitestTestFailureSignal(terminalAttempt) &&
    !/\b(?:Error|TypeError|ReferenceError|SyntaxError):/.test(terminalAttempt) &&
    !terminalAttempt.includes('Failed to import test file') &&
    !hasGenericFailureSignal(terminalAttempt) &&
    !hasExplicitOomEvidence(terminalAttempt) &&
    !hasStorybookViteOptimizerNewDepsReload(terminalAttempt)
  )
}

const hasStorybookBrowserAddonVitestSetupRunnerMissing = (log: string): boolean => {
  const plainLog = stripAnsi(log)
  const attemptIndex = plainLog.lastIndexOf(storybookBrowserAttemptMarker)
  const terminalAttempt = plainLog.slice(attemptIndex === -1 ? 0 : attemptIndex)
  return (
    plainLog.includes('VITEST_STORYBOOK_BROWSER: 1') &&
    !hasStorybookViteOptimizerNewDepsReload(terminalAttempt) &&
    terminalAttempt.includes('Failed to import test file') &&
    terminalAttempt.includes('/@storybook/addon-vitest/') &&
    terminalAttempt.includes('/vitest-plugin/setup-file.js') &&
    terminalAttempt.includes('Vitest failed to find the runner') &&
    /Tests.*no tests/.test(terminalAttempt) &&
    !terminalAttempt.includes('|web-storybook-browser')
  )
}

const storybookBrowserAnyProcessExitCodeRe = /Process completed with exit code \d+\./
const storybookBrowserProcessExitCodeRe = /Process completed with exit code (\d+)\./g

const hasOnlyStorybookBrowserWatchdogExitCodes = (plainLog: string): boolean => {
  let hasProcessExitCode = false
  for (const match of plainLog.matchAll(storybookBrowserProcessExitCodeRe)) {
    hasProcessExitCode = true
    const exitCode = match[1]
    if (exitCode !== '1' && exitCode !== '143') return false
  }
  return hasProcessExitCode
}

const hasStorybookBrowserWatchdogExit = (terminalTail: string, plainLog: string): boolean => {
  if (hasOnlyStorybookBrowserWatchdogExitCodes(terminalTail)) return true
  if (storybookBrowserAnyProcessExitCodeRe.test(terminalTail)) return false

  return (
    terminalTail.includes('The runner has received a shutdown signal') &&
    terminalTail.includes('The operation was canceled') &&
    !hasExplicitOomEvidence(plainLog)
  )
}

// The watchdog (ci/storybook-browser-runner.mts) terminates a hung attempt on either of two
// branches, sharing the `[storybook-browser] ` prefix but with distinct terminal phrases: no test
// output ever appeared after Vite finished starting, or semantic test progress appeared and then
// stalled mid-suite. Both are the same transient bootstrap/session hang from the caller's
// perspective; only the first requires test output to be entirely absent.
const storybookBrowserWatchdogHangAfterViteStartupMarker = '[storybook-browser] no test output for'
const storybookBrowserWatchdogMidSuiteStallMarker =
  '[storybook-browser] no semantic test progress for'

const terminalStorybookBrowserWatchdogAttempt = (plainLog: string): string => {
  const watchdogIndex = Math.max(
    plainLog.lastIndexOf(storybookBrowserWatchdogHangAfterViteStartupMarker),
    plainLog.lastIndexOf(storybookBrowserWatchdogMidSuiteStallMarker),
  )
  if (watchdogIndex === -1) return ''

  const attemptIndex = plainLog.lastIndexOf(storybookBrowserAttemptMarker, watchdogIndex)
  return plainLog.slice(attemptIndex === -1 ? watchdogIndex : attemptIndex)
}

const hasStorybookBrowserWatchdogHangAfterViteStartup = (log: string): boolean => {
  const plainLog = stripAnsi(log)
  const watchdogAttempt = terminalStorybookBrowserWatchdogAttempt(plainLog)
  if (watchdogAttempt === '') return false
  if (!plainLog.includes('VITEST_STORYBOOK_BROWSER: 1')) return false
  if (!hasStorybookBrowserViteReady(watchdogAttempt)) return false

  const midSuiteStallIndex = watchdogAttempt.lastIndexOf(
    storybookBrowserWatchdogMidSuiteStallMarker,
  )
  const postStartupHangIndex = watchdogAttempt.lastIndexOf(
    storybookBrowserWatchdogHangAfterViteStartupMarker,
  )
  const watchdogIndex = Math.max(midSuiteStallIndex, postStartupHangIndex)
  const terminalWatchdogTail = watchdogAttempt.slice(watchdogIndex)
  if (terminalWatchdogTail.includes(storybookBrowserAttemptMarker)) return false
  if (!hasStorybookBrowserWatchdogExit(terminalWatchdogTail, plainLog)) return false

  if (midSuiteStallIndex > postStartupHangIndex) {
    return terminalWatchdogTail.includes('terminating terminal mid-suite stall')
  }
  return (
    terminalWatchdogTail.includes(
      'after Vite startup — suspected Vitest/Chromium tester-connection hang',
    ) && !hasStorybookBrowserTestOutput(watchdogAttempt)
  )
}

// Rule id preserved for counter-continuity; fingerprint was broadened to cover any
// Vite dev-server localhost fetch failure, not just setup-file-with-project-annotations.js.
// maxAttempts: 1 means exactly ONE automatic rerun (decide.mts evaluates maxAttempts >= runAttempt,
// so attempt 1 is auto-retried → attempt 2 checks the same fingerprint → if it matches again, the
// rule is exhausted and Harness is dispatched). Do not raise to 3 without confirmed evidence of a
// real three-attempt flake run; increasing it would delay Harness dispatch for genuine bugs.
export const storybookBrowserStartupTransientRule: TransientRetryRule = {
  id: 'storybook-browser-startup-transient',
  consumerKey: 'storybook-browser-startup',
  rootCauseKey: 'browser-vite-bootstrap-transient',
  description:
    'Storybook browser-mode startup fails while Vite, Vitest, and Chromium establish the test session.',
  rationale:
    'The consolidated fingerprint covers bounded bootstrap failures before tests begin: missing runner context, a dropped localhost module fetch, a Vite optimizer timeout, a watchdog exit, or a browser-session connection timeout. Assertion failures and failures after test execution starts remain excluded.',
  exampleRunIds: ['27467505115'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    const targetedJobName = failedStorybookJobName(ctx)
    const singleStorybookFailure = matchesStorybookSingleJob(ctx)
    if (targetedJobName === undefined && !singleStorybookFailure) return false
    const jobName = targetedJobName ?? storybookLogJobName(ctx)
    const logs = ctx.jobLogs ? await ctx.jobLogs([jobName]) : await ctx.failedJobLogs()
    const log = logs.get(jobName) ?? ''
    if (hasStorybookBrowserAddonVitestSetupRunnerMissing(log)) return true
    return (
      singleStorybookFailure &&
      (hasStorybookViteServerFetchFailure(log) ||
        hasStorybookBrowserTestTimeoutDuringViteOptimizerScan(log) ||
        hasStorybookBrowserWatchdogHangAfterViteStartup(log) ||
        hasStorybookBrowserSessionConnectionTimeout(log))
    )
  },
}
