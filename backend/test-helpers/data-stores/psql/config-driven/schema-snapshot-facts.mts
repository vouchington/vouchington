import type { PostgresSqlConflict, PostgresSqlInsert } from 'no-mistakes'

import {
  createSchemaSnapshotFacts,
  type SchemaSnapshotFacts,
} from '../../../../../ci/generated-ddl-inserts/schema-snapshot-facts.mts'
import { insertInvariantFixtureSchema } from './insert-invariant-fixture-schema.mts'

const fixtureFacts: SchemaSnapshotFacts = await createSchemaSnapshotFacts(
  insertInvariantFixtureSchema,
)

export const fixtureInsertFacts = {
  hasReplayUnsafeTrigger: fixtureFacts.hasReplayUnsafeTrigger,
  hasGeneratedArbiterViolation: fixtureFacts.hasGeneratedArbiterViolation,
}

/** `undefined` means the table is absent from the fixture; malformed DDL is an unsafe entry. */
export function triggerFactsForTable(
  table: string,
): ReturnType<SchemaSnapshotFacts['triggerFactsForTable']> {
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
): ReturnType<SchemaSnapshotFacts['generatedDependenciesForTable']> {
  return fixtureFacts.generatedDependenciesForTable(table)
}

export function hasGeneratedArbiterViolation(
  insert: PostgresSqlInsert,
  onConflict: PostgresSqlConflict,
): boolean {
  return fixtureFacts.hasGeneratedArbiterViolation(insert, onConflict)
}
