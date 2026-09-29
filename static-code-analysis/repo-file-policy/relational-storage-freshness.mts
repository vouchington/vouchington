import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import {
  ALLOWED_NONRELATION_UUID,
  ALLOWED_OWN_PRIMARY_UUID,
  ALLOWED_OPAQUE_JSON,
  GENERATED_FK_ALIASES,
  PARTITION_FOREIGN_KEY_COLUMNS,
} from './relational-storage-catalog.mts'
import { EXISTING_RELATIONAL_STORAGE_DEBT } from './relational-storage-debt.mts'
import {
  isGeneratedAlias,
  relationalStorageDiagnostic,
  type ObservedRelationalDebt,
  type RelationalStorageOptions,
} from './relational-storage-type-rules.mts'

type Catalog = ReadonlySet<string>

function checkFreshness(
  label: string,
  declared: Catalog,
  observed: ReadonlySet<string>,
  errors: string[],
): void {
  for (const key of declared) {
    if (observed.has(key)) continue
    errors.push(relationalStorageDiagnostic(key, `stale ${label} catalog entry; remove it`))
  }
}

function checkDisjoint(allowed: Catalog, debt: Catalog, label: string, errors: string[]): void {
  for (const key of allowed) {
    if (!debt.has(key)) continue
    errors.push(relationalStorageDiagnostic(key, `duplicate ${label} catalog entry`))
  }
}

export function appendCatalogFreshness(
  schema: SchemaSnapshot,
  observed: ObservedRelationalDebt,
  errors: string[],
  options: RelationalStorageOptions,
): void {
  checkDisjoint(ALLOWED_OPAQUE_JSON, EXISTING_RELATIONAL_STORAGE_DEBT.json, 'JSON', errors)
  checkDisjoint(
    ALLOWED_NONRELATION_UUID,
    EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
    'UUID',
    errors,
  )
  checkDisjoint(
    ALLOWED_OWN_PRIMARY_UUID,
    EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
    'own primary UUID',
    errors,
  )
  checkFreshness('opaque JSON', ALLOWED_OPAQUE_JSON, observed.json, errors)
  checkFreshness('JSON remediation', EXISTING_RELATIONAL_STORAGE_DEBT.json, observed.json, errors)
  checkFreshness(
    'UUID array remediation',
    EXISTING_RELATIONAL_STORAGE_DEBT.uuidArray,
    observed.uuidArray,
    errors,
  )
  checkFreshness(
    'nonrelationship UUID',
    ALLOWED_NONRELATION_UUID,
    observed.missingForeignKey,
    errors,
  )
  checkFreshness('own primary UUID', ALLOWED_OWN_PRIMARY_UUID, observed.ownPrimary, errors)
  for (const [key, alias] of GENERATED_FK_ALIASES) {
    const [tableName, columnName] = key.split('.')
    const table = tableName ? schema.tables[tableName] : undefined
    if (
      table &&
      columnName &&
      isGeneratedAlias(table, key, table.columns[columnName]?.generatedExpression ?? null)
    )
      continue
    errors.push(
      relationalStorageDiagnostic(
        key,
        `stale or invalid generated FK alias catalog entry: ${alias.expression}; ${alias.oneTargetCheck}`,
      ),
    )
  }
  for (const key of PARTITION_FOREIGN_KEY_COLUMNS) {
    const [tableName, columnName] = key.split('.')
    if (
      options.verifiedPartitionForeignKeys?.has(key) &&
      tableName &&
      columnName &&
      schema.tables[tableName]?.columns[columnName]
    )
      continue
    errors.push(relationalStorageDiagnostic(key, 'partition FK proof is missing or stale'))
  }
  checkFreshness(
    'missing foreign key remediation',
    EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
    observed.missingForeignKey,
    errors,
  )
  checkFreshness(
    'encoded reference remediation',
    EXISTING_RELATIONAL_STORAGE_DEBT.encodedReference,
    observed.encodedReference,
    errors,
  )
}
