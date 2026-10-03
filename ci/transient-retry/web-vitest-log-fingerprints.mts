const webVitestSigsegvMarker = 'Command was killed with SIGSEGV (Segmentation fault): '

function hasCurrentWebVitestShardCommand(command: string): boolean {
  // tests-web.yml's "Run web tests" step is
  // `pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web --shard <n>/<total>`.
  // Worker count comes from the workflow-owned VITEST_MAX_WORKERS environment, not a CLI flag.
  // Do not require retired flags such as --passWithNoTests. `--project web` is one argument so
  // web-api, web-integration, and web-storybook commands stay excluded. The wrapper prefix is
  // optional so the older direct `vitest run` invocation still matches.
  return (
    /(?:^|\s)(?:\.\/ci\/with-node-test-options\s+)?vitest run\b/.test(command) &&
    command.includes('--bail=3') &&
    /(?:^|\s)--project web(?![\w-])/.test(command) &&
    /--shard(?:\s+|=)['"]?\d+\/\d+/.test(command)
  )
}

export function hasWebVitestSegfault(log: string): boolean {
  const failureIndex = log.lastIndexOf('ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL')
  if (failureIndex === -1) return false

  const terminalFailure = log.slice(failureIndex)
  const markerIndex = terminalFailure.lastIndexOf(webVitestSigsegvMarker)
  if (markerIndex === -1) return false
  const command = terminalFailure.slice(markerIndex + webVitestSigsegvMarker.length)

  return (
    hasCurrentWebVitestShardCommand(command) &&
    terminalFailure.includes('##[error]Process completed with exit code 1.')
  )
}
