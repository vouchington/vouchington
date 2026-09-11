import { suiteCoverageCommand, type Suite } from './coverage-suites-local.mts'

export function selectionDiagnosticLines({
  notVerified,
  trulyUnmapped,
  uninstrumented,
}: {
  notVerified: string[]
  trulyUnmapped: string[]
  uninstrumented: string[]
}): string[] {
  const lines: string[] = []

  if (notVerified.length > 0) {
    lines.push(
      'Warning: the following changed files were NOT verified locally (web-init suite',
      '  skipped because web init is absent):',
      ...notVerified.map(f => `  ${f}`),
      'Action: ./dev/initialize web && source .env',
      'Then re-run: pnpm run coverage:patch:affected',
      '',
    )
  }

  if (uninstrumented.length > 0) {
    lines.push(
      'Note: the following changed files are setup/docs inputs and are not instrumented by local patch coverage:',
      ...uninstrumented.map(f => `  ${f}`),
      'Authoritative coverage command for code changes: pnpm run coverage:patch:full',
      '',
    )
  }

  if (trulyUnmapped.length > 0) {
    lines.push(
      'Note: the following changed files do not match any local Vitest suite:',
      ...trulyUnmapped.map(f => `  ${f}`),
      'These files have no local coverage. The gate below will fail.',
      'Consider adding sourcePatterns in ci/coverage-suites-local.mts.',
      '',
    )
  }

  return lines
}

export function advisoryGateSummaryLines({ notVerified }: { notVerified: string[] }): string[] {
  const lines = [
    '',
    'Advisory mode (default): coverage:patch:affected never blocks — see the warnings above.',
  ]

  if (notVerified.length > 0) {
    lines.push(
      `${notVerified.length} changed file(s) above were not verified locally; this is advisory only.`,
    )
  }

  lines.push(
    'Run with --strict to make this command exit non-zero on shortfall (previous default behavior).',
    'CI and `pnpm run coverage:patch:full` remain the authoritative, blocking gates.',
  )

  return lines
}

/**
 * Exit code for coverage:patch:affected. In --strict mode, unverified files (web-init suites
 * skipped) also force a non-zero exit; outside --strict, blockingStatus passes through unchanged
 * so a real error (bad rules, crash) still surfaces, but a plain coverage shortfall never blocks —
 * coverage-check itself already exits 0 for that case when called with advisory: true.
 */
export function resolveAdvisoryExitCode({
  strict,
  blockingStatus,
  notVerified,
}: {
  strict: boolean
  blockingStatus: number
  notVerified: string[]
}): number {
  if (!strict) return blockingStatus
  return notVerified.length > 0 ? Math.max(blockingStatus, 1) : blockingStatus
}

export function suiteFailureReproductionLines(
  suite: Suite,
  coverageDir: string,
  base: string,
  head: string,
): string[] {
  const { envPrefix, command } = suiteCoverageCommand(suite, coverageDir)
  return [
    '',
    'Reproduce the failed suite only:',
    `  ${envPrefix}${command}`,
    'After that passes, rerun the affected coverage pre-check:',
    `  pnpm run coverage:patch:affected -- --base ${base} --head ${head}`,
  ]
}
