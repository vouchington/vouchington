#!/usr/bin/env node
/**
 * Renders the JSON produced by ci/setup-web-integration.mts's incremental timing report into a
 * human-readable $GITHUB_STEP_SUMMARY section for the `build-web-targets` composite action
 * (issue #10937).
 *
 * A plain `cat` of the raw JSON into a fenced code block would leave the host pressure snapshot's
 * multi-line diagnostic text JSON-escaped onto a single unreadable line (literal `\n` sequences).
 * This instead prints the numeric timings as their own small JSON block (already compact and
 * readable) and the raw pressure text separately, un-escaped, inside a collapsible `<details>`
 * block, for issue #10937.
 *
 * Never fails the caller: this step runs `if: always()` after a build that may have failed or
 * been killed mid-step, so a missing, empty, or malformed timings file (e.g. the very first step
 * never got a chance to run) is tolerated silently.
 *
 * Usage: node ci/write-web-build-timings-summary.mts <timings-json-path>
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import type { HostPressureSnapshot } from './host-pressure-snapshot.mts'

interface TimingReport {
  startedAt: string
  nextBuildCache: 'hit' | 'miss' | 'disabled'
  hostPressureAtBuildStart?: HostPressureSnapshot
  nextBuildLockAcquisitionFailed?: boolean
  timings: Record<string, number>
}

export function renderTimingsSummary(report: TimingReport): string {
  const lines = [
    '## Web build timings (`build-web-targets`)',
    '',
    `- Started: ${report.startedAt}`,
    `- Next.js build cache: ${report.nextBuildCache}`,
  ]

  if (report.nextBuildLockAcquisitionFailed) {
    // Without this line, a reader can mistake the fail-closed admission wait recorded below as
    // compiler wall time and misuse it when re-deriving VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS
    // (docs/development/host-locks.md, issue #10937).
    lines.push(
      '- **Lock acquisition timed out**: the `next-build` duration below is fail-closed admission wait, not compiler wall time.',
    )
  }

  lines.push('', '```json', JSON.stringify(report.timings, null, 2), '```')

  const pressure = report.hostPressureAtBuildStart
  if (pressure) {
    lines.push(
      '',
      `- Host pressure snapshot captured: ${pressure.ok ? 'yes' : 'no'}`,
      '',
      '<details>',
      '<summary>Host pressure at next-build start</summary>',
      '',
      '```',
      pressure.output,
      '```',
      '',
      '</details>',
    )
  }
  lines.push('')

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
