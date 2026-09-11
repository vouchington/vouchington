import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { stripSqlComments } from './sql-scanner.mts'
import { lineOfUtf8ByteOffset } from './sql-ast.mts'
import { extractPolymorphicTargetTables } from './sql-constraint-ast.mts'
import {
  ALLOWED_POLYMORPHIC_TARGET_TABLES,
  POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE,
} from './postgres-schema-guardrail-allowlist.mts'
import {
  checkEditedInPlaceMarkerWording,
  checkStaleLegacyEditedInPlaceMarkerEntries,
} from './edited-in-place-marker-guard.mts'

export function checkMigrationSqlGuard(
  repoRoot: string,
  trackedFiles: string[],
  errors: string[],
): void {
  const observedPolymorphicTargets = new Set<string>()
  const observedLegacyMarkerMigrations = new Set<string>()
  for (const file of trackedFiles) {
    if (!file.startsWith('backend/data-stores/psql/migrations/')) continue
    if (!file.endsWith('.sql')) continue

    const filePath = join(repoRoot, file)
    const content = readFileSync(filePath, 'utf8')
    checkEditedInPlaceMarkerWording(file, content, observedLegacyMarkerMigrations, errors)
    const stripped = stripSqlComments(content)
    for (const target of extractPolymorphicTargetTables(stripped)) {
      observedPolymorphicTargets.add(target.tableName)
      if (ALLOWED_POLYMORPHIC_TARGET_TABLES.has(target.tableName)) continue
      errors.push(
        `::error file=${file},line=${lineOfUtf8ByteOffset(stripped, target.location)}::polymorphic entity_type/entity_id targets are forbidden; use concrete nullable foreign keys with an exact-one-target check`,
      )
    }
  }

  if (trackedFiles.includes(POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE)) {
    for (const table of ALLOWED_POLYMORPHIC_TARGET_TABLES) {
      if (observedPolymorphicTargets.has(table)) continue
      errors.push(
        `::error file=${POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE}::stale PostgreSQL polymorphic-target allowlist entry: ${table}`,
      )
    }
    checkStaleLegacyEditedInPlaceMarkerEntries(observedLegacyMarkerMigrations, errors)
  }
}
