import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import { isNode, parseSource, type ParsedAst, walk } from '../targeted-guardrails/ast-utils.mts'
import { checkPostgresRuntimeSource } from './postgres-runtime-guard.mts'

const RUNTIME_FILE_RE = /^backend\/.*\.(?:mts|ts)$/

// Files scanned separately from the per-file AST pass below: they're allowlists of
// table.column pairs, checked once each against the current schema snapshot rather than parsed
// per tracked file.
const SCHEMA_ALLOWLIST_FILES = [
  'backend/data-stores/psql/test-helpers/schema-static-analysis/uuid-allowlists.mts',
  'backend/data-stores/psql/test-helpers/schema-static-analysis/timestamp-allowlists.mts',
]

/** Selects the backend TypeScript files this guard inspects (includes test code, deliberately). */
export function matchesPostgresRuntimeFile(file: string): boolean {
  return RUNTIME_FILE_RE.test(file)
}

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

/**
 * Whole-guard entry point: thin loop over `checkPostgresRuntimeSource`, parsing each matched file
 * itself, followed by the stale-allowlist check. Production (`repo-file-policy/index.mts`) no
 * longer calls this — it runs `checkPostgresRuntimeSource` through the shared streaming pass in
 * `ast-pass.mts` instead, so every guard parses each file once instead of once per guard, then
 * calls `checkStaleSchemaAllowlistEntries` directly. This export stays as a directly-testable
 * unit for the Postgres-runtime guard.
 */
export function checkPostgresRuntimeGuard(
  repoRoot: string,
  trackedFiles: string[],
  uuidv7Tables: Set<string>,
  schema: Pick<SchemaSnapshot, 'tables'>,
  errors: string[],
  ctx?: SharedContext,
): void {
  for (const file of trackedFiles) {
    if (!matchesPostgresRuntimeFile(file)) continue
    const code = ctx?.readTrackedFile?.(file) ?? readFileSync(join(repoRoot, file), 'utf8')
    if (code === null) continue
    let ast: ParsedAst
    try {
      ast = parseSource(code).ast
    } catch {
      continue
    }
    errors.push(...checkPostgresRuntimeSource(file, code, uuidv7Tables, ast))
  }

  checkStaleSchemaAllowlistEntries(repoRoot, trackedFiles, schema, errors)
}
