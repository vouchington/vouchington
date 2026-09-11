/**
 * Safety primitives for the general runner-shutdown classifier. Core invariant: a job that
 * streamed real failures and was then killed mid-run also lacks an exit-code line, so "markers
 * present + no exit-code error" is UNSAFE — every consumer supplies its own isConsumerFailure.
 */

export function hasRunnerShutdownMarkers(log: string): boolean {
  return (
    log.includes('##[error]The runner has received a shutdown signal.') &&
    (log.includes('##[error]The operation was canceled.') ||
      log.includes('##[error]A task was canceled.') ||
      log.includes('##[error]Process completed with exit code 143.'))
  )
}

/**
 * Returns true when the log has a non-143 exit-code line. Exit code 143 = SIGTERM from the
 * runner shutdown itself, not a real failure; any other code means a genuine error occurred
 * before or independently of the runner being killed.
 */
export function hasGenericFailureSignal(log: string): boolean {
  for (const match of log.matchAll(/##\[error\]Process completed with exit code (\d+)\./g)) {
    if (match[1] !== '143') return true
  }
  return false
}

/** Detects an OOM kill reported by the kernel or the cgroup diagnostics section. */
export function hasExplicitOomEvidence(log: string): boolean {
  if (/Out of memory: Killed process [1-9]\d*\b/.test(log)) return true

  let cgroupStart = log.indexOf('== cgroup memory ==')
  while (cgroupStart !== -1) {
    const afterHeader = cgroupStart + '== cgroup memory =='.length
    const remainingLog = log.slice(afterHeader)
    const nextHeader = remainingLog.search(/\n[^\n]*={2} [^=\n]+ ={2}/)
    const cgroupSection = nextHeader === -1 ? remainingLog : remainingLog.slice(0, nextHeader)
    if (/\boom_kill\s+[1-9]\d*\b/.test(cgroupSection)) return true
    cgroupStart = log.indexOf('== cgroup memory ==', afterHeader)
  }
  return false
}

/**
 * Returns true iff the log is unambiguously a clean runner shutdown:
 *  - the runner shutdown marker and a cancellation, SIGTERM, or exit-143 marker are present, AND
 *  - no non-SIGTERM exit code or explicit OOM evidence is present, AND
 *  - the consumer-specific failure predicate does not fire.
 */
export function isCleanRunnerShutdown(
  log: string,
  isConsumerFailure: (log: string) => boolean,
): boolean {
  return (
    hasRunnerShutdownMarkers(log) &&
    !hasGenericFailureSignal(log) &&
    !hasExplicitOomEvidence(log) &&
    !isConsumerFailure(log)
  )
}

// ---------------------------------------------------------------------------
// Per-consumer failure predicates
// ---------------------------------------------------------------------------

/** Detects a real Vitest failure in backend-unit shard logs. */
export function hasBackendUnitVitestFailure(log: string): boolean {
  return (
    log.includes(' FAIL ') ||
    log.includes('AssertionError') ||
    log.includes('Test timed out in') ||
    log.includes('Error: Test timed out') ||
    hasMigrationFailureSignal(log)
  )
}

export function hasBackendCredentialedVitestFailure(log: string): boolean {
  return (
    hasBackendUnitVitestFailure(log) ||
    hasVitestUnhandledErrorSignal(log) ||
    /(^|\n).*\bFAIL\s+\S+.*\s>\s/.test(log) ||
    /(^|\n).*\bFailed Tests\s+\d+/.test(log) ||
    /(^|\n).*Test Files\s+.*\bfailed\b/.test(log) ||
    /(^|\n).*Tests\s+.*\bfailed\b/.test(log)
  )
}

export function hasBackendCredentialedVitestStarted(log: string): boolean {
  return (
    log.includes('Run backend credentialed tests') ||
    log.includes(
      'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-aws --project backend-bedrock --project backend-openai --project backend-stripe',
    )
  )
}

/**
 * Detects a real smoke-test failure.  Backend and web CI jobs run smoke tests
 * after Vitest/Next build; the smoke-test scripts emit "✗ Error: …" for server
 * startup, HTTP, or response failures.
 */
export function hasSmokeTestFailureSignal(log: string): boolean {
  return log.includes('✗ Error:')
}

export function hasToolingVitestStarted(log: string): boolean {
  return (
    log.includes('ci/tooling-test-runner.mts') ||
    log.includes('pnpm run test:tooling') ||
    log.includes('VITEST_COVERAGE_SCOPE=tooling')
  )
}

export function hasStorybookVitestStarted(log: string): boolean {
  return log.includes('VITEST_COVERAGE_SCOPE=web-storybook')
}

/** Detects a real Next.js build failure. */
export function hasNextBuildFailureSignal(log: string): boolean {
  return [
    'Failed to compile',
    'Type error:',
    'Syntax Error',
    'Module not found:',
    '> Build error occurred',
    'Error occurred prerendering page',
    'Export encountered errors',
  ].some(marker => log.includes(marker))
}

export function hasExpensiveBuildCommandTimeout(log: string): boolean {
  return /with-host-lock: .* command exceeded \d+s; terminating its process group/.test(log)
}

/** Detects setup failures from shared web-stack build steps. */
export function hasWebStackBuildFailureSignal(log: string): boolean {
  return (
    hasNextBuildFailureSignal(log) ||
    hasExpensiveBuildCommandTimeout(log) ||
    [
      '✘ [ERROR]',
      'Error: Build failed',
      'Build failed with',
      'Failed to load next.config',
      'The web build requires sharp >=0.35.0',
      // setup-web-integration.mts's post-build artifact checks and asset-copy phase, which can
      // precede a shutdown race.
      'Missing Cloudflare Worker build artifact',
      'Missing Next.js standalone server artifact',
      'standalone-asset-copy failed:',
    ].some(marker => log.includes(marker))
  )
}

/** Detects backend migration/setup failures before test execution. */
export function hasMigrationFailureSignal(log: string): boolean {
  return [
    'ERROR: running migration',
    'ERROR: running config-driven migration',
    'Migration failed with exit code',
  ].some(marker => log.includes(marker))
}

/** Detects a real Vitest failure or startup/config failure. */
export function hasVitestTestFailureSignal(log: string): boolean {
  return (
    hasVitestUnhandledErrorSignal(log) ||
    [
      /(^|\n).*failed to load config/i,
      /(^|\n).*Startup Error/i,
      /(^|\n).*No test files found/i,
      /(^|\n).*\(\d+ tests? \| [^)]*\bfailed\b[^)]*\)/,
      /(^|\n).*\bFailed Tests\s+\d+/,
      /(^|\n).*FAIL\s+/,
      /(^|\n).*Test Files\s+.*\bfailed\b/,
      /(^|\n).*Tests\s+.*\bfailed\b/,
      /(^|\n).*AssertionError:/,
      /(^|\n).*Error: Test timed out in \d+ms/,
    ].some(pattern => pattern.test(log))
  )
}

function hasVitestUnhandledErrorSignal(log: string): boolean {
  return /(^|\n).*(Unhandled Errors?|Unhandled Rejections?|Vitest caught \d+ unhandled errors?)/i.test(
    log,
  )
}

/** Detects a real Playwright test failure. */
export function hasPlaywrightFailureSignal(log: string): boolean {
  return [
    /(^|\n).*Error: expect\(/,
    /(^|\n).*AssertionError:/,
    /(^|\n).*TimeoutError:/,
    /(^|\n).*Test timeout of \d+ms exceeded/,
    /(^|\n).*\b\d+\s+failed\b/,
    /(^|\n).*\bFailed Tests\b/,
    /(^|\n).*FAIL\s+/,
  ].some(pattern => pattern.test(log))
}
