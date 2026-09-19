#!/usr/bin/env node
/**
 * Renders the JSON produced by ci/setup-web-integration.mts's incremental timing report into a
 * human-readable $GITHUB_STEP_SUMMARY section for the `build-web-targets` composite action
 * (issue #10937: the incremental-write contract means a watchdog SIGKILL mid-build still leaves a
 * partial report on disk for this step to render).
 *
 * Never fails the caller: this step runs `if: always()` after a build that may have failed or
 * been killed mid-step, so a missing, empty, or malformed timings file (e.g. the very first step
 * never got a chance to run) is tolerated silently.
 *
 * Usage: node ci/write-web-build-timings-summary.mts <timings-json-path>
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

interface TimingReport {
  startedAt: string
  nextBuildCache: 'hit' | 'miss' | 'disabled'
  timings: Record<string, number>
}

export function renderTimingsSummary(report: TimingReport): string {
  const lines = [
    '## Web build timings (`build-web-targets`)',
    '',
    `- Started: ${report.startedAt}`,
    `- Next.js build cache: ${report.nextBuildCache}`,
    '',
    '```json',
    JSON.stringify(report.timings, null, 2),
    '```',
    '',
  ]

  return lines.join('\n')
}

function main(): void {
  const [timingsPath] = process.argv.slice(2)
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (
    timingsPath == null ||
    timingsPath.trim() === '' ||
    summaryPath == null ||
    summaryPath.trim() === ''
  ) {
    return
  }
  if (!existsSync(timingsPath)) return

  const report = JSON.parse(readFileSync(timingsPath, 'utf8')) as TimingReport
  appendFileSync(summaryPath, `${renderTimingsSummary(report)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `write-web-build-timings-summary: best-effort instrumentation failed, continuing: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  )
}
