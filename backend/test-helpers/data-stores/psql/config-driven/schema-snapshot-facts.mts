import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  parsePostgresSql,
  type PostgresSqlConflict,
  type PostgresSqlInsert,
  type PostgresSqlTrigger,
} from 'no-mistakes'
import {
  createPostgresReplayContextFromSchema,
  projectGeneratedArbiterInput,
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

// The snapshot is immutable for this process. Parse its trigger DDL in one native batch so the
// synchronous INSERT guard consumes only normalized facts. A malformed trigger stays undefined and
// fails closed; an existing table with no triggers retains its safe empty list.
const triggerEntries = Object.keys(schema.tables).flatMap(table =>
  (replayContext.triggerTextsForTable(table) ?? []).map(sql => ({ table, sql })),
)
const parsedTriggerEntries = await parsePostgresSql(triggerEntries.map(({ sql }) => ({ sql })))
const triggerFactsByTable = new Map<string, (PostgresSqlTrigger | undefined)[]>(
  Object.keys(schema.tables).map(table => [table, []]),
)
for (const [index, { table }] of triggerEntries.entries()) {
  const parsed = parsedTriggerEntries[index]
  const statement = parsed?.statements[0]
  const trigger =
    parsed?.diagnostics.length === 0 &&
    parsed.statements.length === 1 &&
    statement?.kind === 'createTrigger'
      ? statement.trigger
      : undefined
  triggerFactsByTable.get(table)?.push(trigger)
}

/** `undefined` means the table is absent from the snapshot; malformed DDL is an unsafe entry. */
export function triggerFactsForTable(
  table: string,
): readonly (PostgresSqlTrigger | undefined)[] | undefined {
  return triggerFactsByTable.get(table)
}

export function hasReplayUnsafeTrigger(
  insert: PostgresSqlInsert,
  onConflict: PostgresSqlConflict,
): boolean {
  const table = insertTableName(insert)
  if (table === undefined) return true
  const triggers = triggerFactsForTable(table)
  if (triggers === undefined) return true
  const assignedColumns = assignedColumnsFromOnConflict(onConflict)
  const excludedAssignedColumns = excludedAssignedColumnsFromOnConflict(onConflict)
  const conflictWhereClause =
    onConflict.action.kind === 'doUpdate' ? onConflict.action.predicate : null
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

export function hasGeneratedArbiterViolation(
  insert: PostgresSqlInsert,
  onConflict: PostgresSqlConflict,
): boolean {
  const table = insertTableName(insert)
  if (table === undefined) return true
  const dependencies = generatedDependenciesForTable(table)
  if (dependencies === undefined) return true
  return generatedArbiterViolation(projectGeneratedArbiterInput(onConflict), dependencies).violation
}
