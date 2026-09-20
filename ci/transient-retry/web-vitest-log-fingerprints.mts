function hasCurrentWebVitestShardCommand(log: string): boolean {
  // Worker count is no longer a CLI flag (tests-web.yml previously hardcoded --maxWorkers=7;
  // it now comes from the workflow-owned VITEST_MAX_WORKERS environment, consumed by the root
  // vitest.config.mts, and never appears on the command line). Keep
  // this in sync with tests-web.yml's "Run web tests" invocation if that command changes again.
  return (
    log.includes('vitest run') &&
    log.includes('--bail=3') &&
    log.includes('--project web') &&
    /--shard(?:\s+|=)['"]?\d+\/\d+/.test(log) &&
    log.includes('--passWithNoTests')
  )
}

export function hasWebVitestSegfault(log: string): boolean {
  const failureIndex = log.lastIndexOf('ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL')
  if (failureIndex === -1) return false

  const terminalFailure = log.slice(failureIndex)
  return (
    terminalFailure.includes('Command was killed with SIGSEGV (Segmentation fault): vitest run') &&
    hasCurrentWebVitestShardCommand(terminalFailure) &&
    terminalFailure.includes('##[error]Process completed with exit code 1.')
  )
}

export function hasWebVitestWorkerStartTimeoutAfterPassingSummary(log: string): boolean {
  const failedWorkerStartMarker = '[vitest-pool]: Failed to start threads worker for test files '
  if (!log.includes(failedWorkerStartMarker)) return false

  return (
    hasCurrentWebVitestShardCommand(log) &&
    log.includes('Vitest caught 1 unhandled error during the test run.') &&
    log.includes('[vitest-pool-runner]: Timeout waiting for worker to respond') &&
    /\bTest Files\b[^\n]*\bpassed\b/.test(log) &&
    !/\bTest Files\b[^\n]*\bfailed\b/.test(log) &&
    /\bTests\b[^\n]*\bpassed\b/.test(log) &&
    !/\bTests\b[^\n]*\bfailed\b/.test(log) &&
    log.includes('##[error]Process completed with exit code 1.')
  )
}
