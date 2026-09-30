import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Options {
  report: Record<string, boolean>
  issues: Record<string, Record<string, Record<string, unknown>>>
  counters: Record<string, number>
}

/**
 * Knip `--preprocessor` for `pnpm run knip:production-exports`. Drops the findings listed in
 * `baseline.txt` (one `<issueType> <path> <symbol>` line each) so Knip fails only on new ones, and
 * fails on baseline lines that no longer match a finding. `KNIP_BASELINE_UPDATE=1` rewrites the
 * baseline from the current findings first. Knip keys `issues` by cwd-relative POSIX path.
 */
export default function baseline(
  options: Options,
  file = join(import.meta.dirname, 'baseline.txt'),
): Options {
  const found = []
  for (const [type, files] of Object.entries(options.issues)) {
    if (!options.report[type]) continue
    options.issues[type] = {}
    for (const [path, symbols] of Object.entries(files)) {
      for (const [symbol, issue] of Object.entries(symbols)) {
        found.push({ type, path, symbol, issue, line: `${type} ${path} ${symbol}` })
      }
    }
  }
  if (process.env.KNIP_BASELINE_UPDATE === '1') {
    writeFileSync(
      file,
      found
        .map(finding => `${finding.line}\n`)
        .toSorted()
        .join(''),
    )
  }
  const stale = new Set(readFileSync(file, 'utf8').split('\n').filter(Boolean))
  let hasNewFindings = false
  for (const { type, path, symbol, issue, line } of found) {
    if (stale.delete(line)) {
      options.counters[type]--
    } else {
      ;(options.issues[type][path] ??= {})[symbol] = issue
      hasNewFindings = true
    }
  }
  if (hasNewFindings) {
    console.error(
      'New exports only tests use: delete the export, make it module-private, move a test-only ' +
        'helper into test helpers, or mark a deliberate seam @public with a reason. ' +
        'See docs/development/quality/static-code-analysis/README.md#knip-production-exports.',
    )
  }
  for (const line of stale) {
    console.error(
      `Stale baseline entry, remove it with pnpm run knip:production-exports:update: ${line}`,
    )
  }
  // Knip resets `process.exitCode` to 0 after preprocessing, so fail from the `exit` event.
  if (stale.size > 0) {
    process.once('exit', () => {
      process.exitCode = 1
    })
  }
  return options
}
