import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import { ALLOWED_OPAQUE_JSON } from './relational-storage-catalog.mts'
import {
  classifyRelationalColumn,
  checkCategory,
} from './relational-storage-column-classification.mts'
import { EXISTING_RELATIONAL_STORAGE_DEBT } from './relational-storage-debt.mts'
import { appendCatalogFreshness } from './relational-storage-freshness.mts'
import {
  isKnownColumnType,
  relationalStorageDiagnostic,
  type ObservedRelationalDebt,
  type RelationalStorageOptions,
} from './relational-storage-type-rules.mts'

/** Enforce application-owned relationships against the committed, PostgreSQL-generated schema. */
export function checkRelationalStorage(
  schema: SchemaSnapshot,
  options: RelationalStorageOptions = {},
): string[] {
  const errors: string[] = []
  const observed: ObservedRelationalDebt = {
    encodedReference: new Set(),
    json: new Set(),
    missingForeignKey: new Set(),
    ownPrimary: new Set(),
    uuidArray: new Set(),
  }

  for (const [tableName, table] of Object.entries(schema.tables)) {
    for (const [columnName, column] of Object.entries(table.columns)) {
      const key = `${tableName}.${columnName}`
      const type = column.type.toLowerCase()
      if (!isKnownColumnType(type, schema.enums)) {
        errors.push(
          relationalStorageDiagnostic(
            key,
            `domain-backed type ${column.type} must be resolved to its base type before relational classification`,
          ),
        )
        continue
      }
      if (/^jsonb?(?:\[\])*$/u.test(type)) {
        checkCategory(
          key,
          'JSON storage',
          ALLOWED_OPAQUE_JSON,
          EXISTING_RELATIONAL_STORAGE_DEBT.json,
          observed.json,
          errors,
        )
      }
      if (/^uuid\[\]$/u.test(type)) {
        checkCategory(
          key,
          'UUID array relationship',
          new Set(),
          EXISTING_RELATIONAL_STORAGE_DEBT.uuidArray,
          observed.uuidArray,
          errors,
        )
      }
      classifyRelationalColumn(key, columnName, column, table, options, observed, errors)
    }
  }

  if (options.enforceCatalogFreshness !== false) {
    appendCatalogFreshness(schema, observed, errors, options)
  }
  return errors
}
