import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parseSync } from '@libpg-query/parser'
import { collectColumnRefs } from './on-conflict-column-refs.mts'
import { generatedArbiterViolation } from './on-conflict-generated-arbiter.mts'
import {
  assignedColumnsFromOnConflict,
  excludedAssignedColumnsFromOnConflict,
  insertTableName,
  replayUnsafeTrigger,
} from './on-conflict-triggers.mts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Parsed once at module load — schema.json is large, and every config-driven guard test in this
// process needs the same, immutable snapshot. Path is resolved relative to this file rather than
// ctx.repoRoot, since this module has no SharedContext to read one from.
const schemaPath = fileURLToPath(new URL('../../schema-snapshot/schema.json', import.meta.url))
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
  tables: Record<
    string,
    {
      triggers: Record<string, string>
      columns: Record<
        string,
        { generated: 'stored' | 'virtual' | null; generatedExpression: string | null }
      >
    }
  >
}

/**
 * `undefined` (fail-closed) when the table itself is unknown to the schema snapshot — the
 * caller should then treat the insert as trigger-unsafe rather than silently skip the check.
 */
export function triggerTextsForTable(table: string): readonly string[] | undefined {
  const snapshotTable = schema.tables[table]
  if (!snapshotTable) return undefined
  return Object.values(snapshotTable.triggers)
}

export function hasReplayUnsafeTrigger(insert: unknown, onConflict: unknown): boolean {
  const table = insertTableName(insert)
  if (table === undefined) return true
  const triggers = triggerTextsForTable(table)
  if (triggers === undefined) return true
  const assignedColumns = assignedColumnsFromOnConflict(onConflict)
  const excludedAssignedColumns = excludedAssignedColumnsFromOnConflict(onConflict)
  const conflictWhereClause = isRecord(onConflict) ? onConflict.whereClause : undefined
  return replayUnsafeTrigger(
    triggers,
    assignedColumns,
    excludedAssignedColumns,
    conflictWhereClause,
  )
}

const generatedDependenciesCache = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>()

/**
 * Maps each STORED generated column in `table` to the source columns its expression reads —
 * mirrors the frontend's `generatedDependenciesForTable`, reading this module's schema.json
 * singleton instead of a `tables` parameter. Memoized per table: called once per judged INSERT,
 * and each miss re-parses every STORED generated column's expression.
 */
export function generatedDependenciesForTable(
  table: string,
): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  const cached = generatedDependenciesCache.get(table)
  if (cached) return cached
  const snapshotTable = schema.tables[table]
  if (!snapshotTable) return undefined
  const dependencies = new Map<string, Set<string>>()
  for (const [column, definition] of Object.entries(snapshotTable.columns)) {
    if (definition.generated !== 'stored' || definition.generatedExpression === null) continue
    const sources = new Set<string>()
    collectColumnRefs(parseSync(`SELECT (${definition.generatedExpression})`), sources)
    if (sources.size > 0) dependencies.set(column, sources)
  }
  generatedDependenciesCache.set(table, dependencies)
  return dependencies
}

export function hasGeneratedArbiterViolation(insert: unknown, onConflict: unknown): boolean {
  const table = insertTableName(insert)
  if (table === undefined) return true
  const dependencies = generatedDependenciesForTable(table)
  if (dependencies === undefined) return true
  return generatedArbiterViolation(onConflict, dependencies).violation
}
