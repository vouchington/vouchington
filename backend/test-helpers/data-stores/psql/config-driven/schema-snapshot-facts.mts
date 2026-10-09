import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  createPostgresReplayContextFromSchema,
  type SchemaSnapshot,
} from 'vouchington-tooling/pg-schema-snapshot'
import { generatedArbiterViolation } from './on-conflict-generated-arbiter.mts'
import {
  assignedColumnsFromOnConflict,
  excludedAssignedColumnsFromOnConflict,
  insertTableName,
  replayUnsafeTrigger,
} from './on-conflict-triggers.mts'

// Read the snapshot and its generated-expression facts once per process for all guard tests.
const schemaPath = fileURLToPath(
  new URL('../../../../data-stores/psql/schema-snapshot/schema.json', import.meta.url),
)
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as SchemaSnapshot
const replayContext = await createPostgresReplayContextFromSchema(schema)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * `undefined` (fail-closed) when the table itself is unknown to the schema snapshot — the
 * caller should then treat the insert as trigger-unsafe rather than silently skip the check.
 */
export function triggerTextsForTable(table: string): readonly string[] | undefined {
  return replayContext.triggerTextsForTable(table)
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

/**
 * Maps each STORED generated column in `table` to the source columns its expression reads —
 * uses released parser facts projected through `createPostgresReplayContextFromSchema`. The module's
 * schema.json is read once; the context memoizes the table projection.
 */
export function generatedDependenciesForTable(
  table: string,
): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  return replayContext.generatedDependenciesForTable(table)
}

export function hasGeneratedArbiterViolation(insert: unknown, onConflict: unknown): boolean {
  const table = insertTableName(insert)
  if (table === undefined) return true
  const dependencies = generatedDependenciesForTable(table)
  if (dependencies === undefined) return true
  return generatedArbiterViolation(onConflict, dependencies).violation
}
