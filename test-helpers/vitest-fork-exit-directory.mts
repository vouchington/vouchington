// Record directory for the published fork-exit sentinel and the local worker-exit reporter.
// Both sides must use this path: the sentinel writes `<pid>.jsonl` from the fork, and the
// reporter reads it back from the parent.
export const forkExitSentinelDirectory =
  process.env.VITEST_FORK_EXIT_SENTINEL_DIR ?? '.vitest-reports/fork-exit-sentinel'
