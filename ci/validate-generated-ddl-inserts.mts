import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { SchemaSnapshot } from 'vouchington-tooling/pg-schema-snapshot'

import { loadGeneratedConfigDrivenSql } from '../backend/test-helpers/data-stores/psql/config-driven/generated-ddl-guard-helpers.mts'
import { findFirstUnguardedInsertViolation } from '../backend/test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts'
import { createSchemaSnapshotFacts } from '../backend/test-helpers/data-stores/psql/config-driven/schema-snapshot-facts.mts'

// Shipped config-driven INSERT policy for the static backend gate. Not a Vitest root.
// Lives outside backend/scripts so the checker can use the test-helper facts without
// crossing that workspace package boundary.
const schemaPath = fileURLToPath(
  new URL('../backend/data-stores/psql/schema-snapshot/schema.json', import.meta.url),
)
const configDrivenDir = fileURLToPath(
  new URL('../backend/data-stores/psql/config-driven/', import.meta.url),
)

const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as SchemaSnapshot
const schemaFacts = await createSchemaSnapshotFacts(schema)
const generatedSql = await loadGeneratedConfigDrivenSql(configDrivenDir)
const failures: string[] = []
for (const { file, sql } of generatedSql) {
  const violation = await findFirstUnguardedInsertViolation(sql, schemaFacts)
  if (violation !== null) failures.push(`${file}: ${violation}`)
}
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
process.exit(0)
