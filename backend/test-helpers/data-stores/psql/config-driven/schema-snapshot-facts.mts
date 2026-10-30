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
import { insertInvariantFixtureSchema } from './insert-invariant-fixture-schema.mts'
import { generatedArbiterViolation } from './on-conflict-generated-arbiter.mts'
import {
  assignedColumnsFromOnConflict,
  excludedAssignedColumnsFromOnConflict,
  insertTableName,
  replayUnsafeTrigger,
} from './on-conflict-triggers.mts'

export type SchemaSnapshotFacts = {
  triggerFactsForTable(table: string): readonly (PostgresSqlTrigger | undefined)[] | undefined
  hasReplayUnsafeTrigger(insert: PostgresSqlInsert, onConflict: PostgresSqlConflict): boolean
  generatedDependenciesForTable(table: string): ReadonlyMap<string, ReadonlySet<string>> | undefined
  hasGeneratedArbiterViolation(insert: PostgresSqlInsert, onConflict: PostgresSqlConflict): boolean
}

/** Facts for one snapshot. Callers pass either the bounded fixture or the committed schema. */
export async function createSchemaSnapshotFacts(
  schema: SchemaSnapshot,
): Promise<SchemaSnapshotFacts> {
  const replayContext = await createPostgresReplayContextFromSchema(schema)
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

  function triggerFactsForTable(
    table: string,
  ): readonly (PostgresSqlTrigger | undefined)[] | undefined {
    return triggerFactsByTable.get(table)
  }

  function hasReplayUnsafeTrigger(
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

  function generatedDependenciesForTable(
    table: string,
  ): ReadonlyMap<string, ReadonlySet<string>> | undefined {
    return replayContext.generatedDependenciesForTable(table)
  }

  function hasGeneratedArbiterViolation(
    insert: PostgresSqlInsert,
    onConflict: PostgresSqlConflict,
  ): boolean {
    const table = insertTableName(insert)
    if (table === undefined) return true
    const dependencies = generatedDependenciesForTable(table)
    if (dependencies === undefined) return true
    return generatedArbiterViolation(projectGeneratedArbiterInput(onConflict), dependencies)
      .violation
  }

  return {
    triggerFactsForTable,
    hasReplayUnsafeTrigger,
    generatedDependenciesForTable,
    hasGeneratedArbiterViolation,
  }
}

// Unit tests use this bounded fixture. The static script loads schema.json itself.
const fixtureFacts = await createSchemaSnapshotFacts(insertInvariantFixtureSchema)

/** `undefined` means the table is absent from the fixture; malformed DDL is an unsafe entry. */
export function triggerFactsForTable(
  table: string,
): readonly (PostgresSqlTrigger | undefined)[] | undefined {
  return fixtureFacts.triggerFactsForTable(table)
}

export function hasReplayUnsafeTrigger(
  insert: PostgresSqlInsert,
  onConflict: PostgresSqlConflict,
): boolean {
  return fixtureFacts.hasReplayUnsafeTrigger(insert, onConflict)
}

/** STORED generated columns in the bounded fixture, projected through parser facts. */
export function generatedDependenciesForTable(
  table: string,
): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  return fixtureFacts.generatedDependenciesForTable(table)
}

export function hasGeneratedArbiterViolation(
  insert: PostgresSqlInsert,
  onConflict: PostgresSqlConflict,
): boolean {
  return fixtureFacts.hasGeneratedArbiterViolation(insert, onConflict)
}
