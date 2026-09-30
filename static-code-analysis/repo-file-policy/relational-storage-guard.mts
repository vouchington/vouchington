import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import { classifyRelationalColumn } from './relational-storage-column-classification.mts'
import { appendCatalogFreshness } from './relational-storage-freshness.mts'
import {
  isKnownColumnType,
  relationalStorageDiagnostic,
  type ObservedRelationalColumns,
  type RelationalStorageOptions,
} from './relational-storage-type-rules.mts'

/** Enforce application-owned relationships against the committed, PostgreSQL-generated schema. */
export function checkRelationalStorage(
  schema: SchemaSnapshot,
  options: RelationalStorageOptions = {},
): string[] {
  const errors: string[] = []
  const observed: ObservedRelationalColumns = {
    encodedReference: new Set(),
    json: new Set(),
    missingForeignKey: new Set(),
    ownPrimary: new Set(),
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
        observed.json.add(key)
      }
      if (/^uuid\[\]$/u.test(type)) {
        // No reviewed catalog covers an array of entity ids; each one takes a relation table.
        errors.push(
          relationalStorageDiagnostic(
            key,
            'UUID array relationship needs concrete relational storage',
          ),
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
