import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { isNode, parseSource, walk } from '../targeted-guardrails/ast-utils.mts'

// Allowlists of table.column pairs, checked once each against the current schema snapshot.
const SCHEMA_ALLOWLIST_FILES = [
  'backend/test-helpers/data-stores/psql/schema-static-analysis/uuid-allowlists.mts',
  'backend/test-helpers/data-stores/psql/schema-static-analysis/timestamp-allowlists.mts',
]

export function findStaleSchemaAllowlistEntries(
  allowlistCode: string,
  schema: Pick<SchemaSnapshot, 'tables'>,
): string[] {
  const entries = new Set<string>()
  const { ast } = parseSource(allowlistCode)
  walk(ast, node => {
    if (node.type !== 'ArrayExpression' || !Array.isArray(node.elements)) return
    const [first, second] = node.elements
    if (
      !isNode(first) ||
      !isNode(second) ||
      first.type !== 'Literal' ||
      second.type !== 'Literal'
    ) {
      return
    }
    if (typeof first.value !== 'string' || typeof second.value !== 'string') return
    if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(first.value)) entries.add(first.value)
  })

  return [...entries].filter(entry => {
    const [table, column] = entry.split('.')
    const tableSnapshot = table ? schema.tables[table] : undefined
    return (
      tableSnapshot === undefined || (column ? tableSnapshot.columns[column] === undefined : false)
    )
  })
}

/** Checks the two schema allowlist files for entries the current schema snapshot no longer has. */
export function checkStaleSchemaAllowlistEntries(
  repoRoot: string,
  trackedFiles: string[],
  schema: Pick<SchemaSnapshot, 'tables'>,
  errors: string[],
): void {
  for (const file of SCHEMA_ALLOWLIST_FILES) {
    if (!trackedFiles.includes(file)) continue
    const stale = findStaleSchemaAllowlistEntries(
      readFileSync(join(repoRoot, file), 'utf8'),
      schema,
    )
    for (const entry of stale) {
      errors.push(`::error file=${file}::stale PostgreSQL schema allowlist entry: ${entry}`)
    }
  }
}
