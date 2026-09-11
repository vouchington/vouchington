import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { extractCreateTableMetadata, lineOfUtf8ByteOffset } from './sql-ast.mts'

// Moderation-action verbs whose presence on a parent-table column signals the
// insert-then-cancel anti-pattern. A column starting with one of these verbs —
// e.g. suspended_at, locked_by_id, blocked BOOLEAN — indicates time-bounded
// state that should live in a lifted_at history table (ref: community_bans).
//
// Excluded intentionally:
//   `disabled`  — feature-toggle pattern (paired enabled_at/disabled_at with CHECK
//                 constraint); not moderation state that needs an audit trail.
//   `flagged`   — AI-output result boolean (agent_moderations.flagged); not a
//                 user-facing toggle to be lifted.
//
// Limitation: a novel verb not in this list will slip through. Add new verbs
// here as they appear; the CLAUDE.md convention covers the rest. See #5154.
const MODERATION_VERBS = [
  'suspended',
  'banned',
  'blocked',
  'locked',
  'muted',
  'silenced',
  'restricted',
  'quarantined',
  'shadowbanned',
  'removed',
  'hidden',
  'frozen',
]

// Matches a bare column name (ColumnDef.colname from the PostgreSQL 18 parser)
// that starts with a moderation verb, followed by an underscore or end-of-string.
// Handles single-word bare verbs (e.g. `blocked`) and prefixed columns
// (e.g. `suspended_at`, `locked_by_id`).
const VERB_COL_RE = new RegExp(`^(${MODERATION_VERBS.join('|')})(?:_|$)`, 'i')

// Directive that exempts a specific column from the guard check.
// Must appear on the same line as the column definition.
// Usage: `blocked BOOLEAN, -- moderation-history-guard-allow: <reason>`
const ALLOW_DIRECTIVE_RE = /--\s*moderation-history-guard-allow:/

// Parse allow-directive line numbers from the raw file content.
// Returns a Set of 1-based line numbers where a moderation-history-guard-allow
// directive appears.
function parseAllowDirectiveLines(rawContent: string): Set<number> {
  const allowLines = new Set<number>()
  const lines = rawContent.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (ALLOW_DIRECTIVE_RE.test(lines[i])) {
      allowLines.add(i + 1) // 1-based line number
    }
  }
  return allowLines
}

export function checkModerationHistoryGuard(
  repoRoot: string,
  trackedFiles: string[],
  errors: string[],
): void {
  for (const file of trackedFiles) {
    if (!file.startsWith('backend/data-stores/psql/migrations/')) continue
    if (!file.endsWith('.sql')) continue

    const filePath = join(repoRoot, file)
    const content = readFileSync(filePath, 'utf8')
    const contentBuffer = Buffer.from(content, 'utf8')

    let tables: ReturnType<typeof extractCreateTableMetadata>
    try {
      tables = extractCreateTableMetadata(content)
    } catch (error) {
      errors.push(`::error file=${file}::${file}: failed to parse SQL: ${String(error)}`)
      continue
    }

    const allowDirectiveLines = parseAllowDirectiveLines(content)

    for (const table of tables) {
      const tableName = table.tableName
      const tableElts = table.columns

      // Tables that already carry a lifted_at column are proper history tables
      const hasLiftedAt = tableElts.some(col => col.name.toLowerCase() === 'lifted_at')
      if (hasLiftedAt) continue

      // `removed` verb family: if the table has removed_at, that column family is
      // the soft-delete append-only pattern, not a moderation toggle.
      const hasRemovedAt = tableElts.some(col => col.name.toLowerCase() === 'removed_at')

      for (const col of tableElts) {
        const colName = col.name
        const m = VERB_COL_RE.exec(colName)
        if (!m) continue
        const verbMatch = m[1].toLowerCase()

        // `removed` verb family: if the table has removed_at, skip this column
        // (soft-delete append-only pattern, not a moderation toggle).
        if (verbMatch === 'removed' && hasRemovedAt) continue

        // Per-column allow-directive: if the raw column line carries the directive,
        // skip this column. col.location is the byte offset of the column name token.
        const lineNum = lineOfUtf8ByteOffset(contentBuffer, col.location ?? 0)
        if (allowDirectiveLines.has(lineNum)) continue

        errors.push(
          `::error file=${file},line=${lineNum}::${tableName}.${colName}: time-bounded moderation state must live in a lifted_at history table (insert-then-cancel; see community_bans), not as a mutable column on the parent. Ref #5154.`,
        )
        break // one error per table is sufficient
      }
    }
  }
}
