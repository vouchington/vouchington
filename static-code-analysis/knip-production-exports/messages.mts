import type { BaselineDiff } from './baseline.mts'
import { BASELINE_PATH, UPDATE_COMMAND } from './config.mts'
import type { Finding } from './report.mts'

const MAX_FILES_LISTED = 40

/** One block per file: `path` then `exports: a, b` and `types: c` lines. */
function listByFile(findings: readonly Finding[]): string[] {
  const files = new Map<string, Map<string, string[]>>()
  for (const { file, symbol, type } of findings) {
    const byType = files.get(file) ?? new Map<string, string[]>()
    byType.set(type, [...(byType.get(type) ?? []), symbol])
    files.set(file, byType)
  }
  const lines: string[] = []
  for (const [file, byType] of [...files].slice(0, MAX_FILES_LISTED)) {
    lines.push(`  ${file}`)
    for (const [type, symbols] of byType) lines.push(`    ${type}: ${symbols.join(', ')}`)
  }
  if (files.size > MAX_FILES_LISTED) {
    lines.push(`  ...and ${files.size - MAX_FILES_LISTED} more files`)
  }
  return lines
}

const FIX_ADVICE = [
  'Fix each new finding at its source, in this order of preference:',
  '  - Delete the export when nothing needs it.',
  '  - Remove `export` (make it module-private) when only its own file uses it.',
  '  - Move a helper that only tests use to a test-helpers location, such as `test-helpers.mts`,',
  '    `*.test-helpers.mts`, a `test-helpers/` directory, or a `__tests__/` directory.',
  '  - Mark a deliberate public seam with a JSDoc `@public` tag (knip never reports it), and say',
  '    in the tag comment who loads it, for example a runner that imports the file by path.',
]

/** The failure text for a run whose findings differ from the checked-in baseline. */
export function formatDiffFailure({ added, removed }: BaselineDiff): string {
  const sections = [
    `knip production-exports findings differ from ${BASELINE_PATH}. Test files were removed for this run.`,
  ]
  if (added.length > 0) {
    sections.push(
      `New findings (${added.length}): exports that nothing outside the removed test files uses.`,
      ...listByFile(added),
      ...FIX_ADVICE,
    )
  }
  if (removed.length > 0) {
    sections.push(
      `Stale baseline entries (${removed.length}): no longer reported, so the baseline must shrink.`,
      ...listByFile(removed),
    )
  }
  sections.push(
    added.length > 0
      ? `Only regenerate the baseline for a reviewed exception: ${UPDATE_COMMAND}`
      : `Regenerate the baseline: ${UPDATE_COMMAND}`,
  )
  return sections.join('\n')
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const formatOk = (count: number) =>
  `knip production-exports: ${count} known findings match ${BASELINE_PATH}; no new or stale entries.`

export const formatUpdated = (count: number, files: number) =>
  `knip production-exports: wrote ${count} findings in ${files} files to ${BASELINE_PATH}.`

export const formatTestFilesRemoved = (count: number) =>
  `knip production-exports: temporarily removed ${count} tracked test files; they are restored from HEAD when the run ends.`
