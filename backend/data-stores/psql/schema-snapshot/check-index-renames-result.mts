import type { RenamedIndex } from '@vouchington/postgres/pg-schema-snapshot'
import { RETIRED_INDEX_ALLOWLIST_FILE } from './retired-index-allowlist.mts'

export type CheckIndexRenamesResult =
  | { status: 'skipped'; reason: string }
  | { status: 'clean' }
  | { status: 'unacknowledged'; unacknowledged: RenamedIndex[]; staleAllowlistEntries: string[] }

type FormattedCheckIndexRenamesResult = { exitCode: 0 | 1; lines: string[] }

/**
 * Renders a `CheckIndexRenamesResult` into GitHub Actions `::notice::`/`::error::` log lines plus
 * the process exit code, kept separate from the direct-execution guard so it stays unit-testable
 * without invoking `process.exit()` mid-test-run.
 */
export function formatCheckIndexRenamesResult(
  result: CheckIndexRenamesResult,
): FormattedCheckIndexRenamesResult {
  if (result.status === 'skipped') {
    return {
      exitCode: 0,
      lines: [`::notice::check-index-renames: ${result.reason}; nothing to compare.`],
    }
  }
  if (result.status === 'clean') {
    return { exitCode: 0, lines: ['No unacknowledged PostgreSQL index renames.'] }
  }
  const lines = result.unacknowledged.map(
    rename =>
      `::error::${rename.table}.${rename.retiredName} was renamed to ${rename.renamedTo} without ` +
      `dropping the old index. Add a migration with '-- migration-mode: online' and ` +
      `'DROP INDEX CONCURRENTLY IF EXISTS ${rename.retiredName};', or add it to ` +
      `${RETIRED_INDEX_ALLOWLIST_FILE} if this is a false positive. ` +
      'See docs/development/postgres-schema-rules.md.',
  )
  lines.push(
    ...result.staleAllowlistEntries.map(
      entry =>
        `::error::stale retired-index allowlist entry in ${RETIRED_INDEX_ALLOWLIST_FILE}: ${entry} ` +
        `— no detected rename matches it anymore (possibly resolved by another already-merged ` +
        `change, not necessarily this branch). Remove this entry.`,
    ),
  )
  return { exitCode: 1, lines }
}
