import type { SchemaSnapshot, SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import {
  ALLOWED_NONRELATION_UUID,
  ALLOWED_OPAQUE_JSON,
  GENERATED_FK_ALIASES,
  PARTITION_FOREIGN_KEY_COLUMNS,
} from './relational-storage-catalog.mts'
import { EXISTING_RELATIONAL_STORAGE_DEBT } from './relational-storage-debt.mts'
import { SCHEMA_SNAPSHOT_PATH } from './schema-snapshot-loader.mts'

type Catalog = ReadonlySet<string>
type Options = {
  enforceCatalogFreshness?: boolean
  verifiedPartitionForeignKeys?: ReadonlySet<string>
}

function diagnostic(column: string, message: string): string {
  return `::error file=${SCHEMA_SNAPSHOT_PATH}::${column}: ${message}`
}

function coveredByForeignKey(table: SchemaTableSnapshot, name: string): boolean {
  return Object.values(table.foreignKeys).some(fk => fk.columns.includes(name))
}

function isGeneratedAlias(
  table: SchemaTableSnapshot,
  key: string,
  expression: string | null,
): boolean {
  const expected = GENERATED_FK_ALIASES.get(key)
  return (
    expected !== undefined &&
    expression === expected &&
    ['topic_id', 'rss_feed_id', 'community_id'].every(name => coveredByForeignKey(table, name))
  )
}

function checkCategory(
  key: string,
  kind: string,
  accepted: Catalog,
  debt: Catalog,
  observed: Set<string>,
  errors: string[],
): void {
  observed.add(key)
  if (accepted.has(key) || debt.has(key)) return
  errors.push(
    diagnostic(key, `${kind} needs concrete relational storage or an exact reviewed exception`),
  )
}

function checkFreshness(
  label: string,
  declared: Catalog,
  observed: ReadonlySet<string>,
  errors: string[],
): void {
  for (const key of declared) {
    if (observed.has(key)) continue
    errors.push(diagnostic(key, `stale ${label} catalog entry; remove it`))
  }
}

function checkDisjoint(allowed: Catalog, debt: Catalog, label: string, errors: string[]): void {
  for (const key of allowed) {
    if (debt.has(key)) errors.push(diagnostic(key, `duplicate ${label} catalog entry`))
  }
}

/** Enforce application-owned relationships against the committed, PostgreSQL-generated schema. */
export function checkRelationalStorage(schema: SchemaSnapshot, options: Options = {}): string[] {
  const errors: string[] = []
  const json = new Set<string>()
  const uuidArray = new Set<string>()
  const missingForeignKey = new Set<string>()
  const encodedReference = new Set<string>()

  for (const [tableName, table] of Object.entries(schema.tables)) {
    for (const [columnName, column] of Object.entries(table.columns)) {
      const key = `${tableName}.${columnName}`
      const type = column.type.toLowerCase()
      if (/^jsonb?(?:\[\])*$/u.test(type)) {
        checkCategory(
          key,
          'JSON storage',
          ALLOWED_OPAQUE_JSON,
          EXISTING_RELATIONAL_STORAGE_DEBT.json,
          json,
          errors,
        )
      }
      if (/^uuid\[\]$/u.test(type)) {
        checkCategory(
          key,
          'UUID array relationship',
          new Set(),
          EXISTING_RELATIONAL_STORAGE_DEBT.uuidArray,
          uuidArray,
          errors,
        )
      }
      if (
        type === 'uuid' &&
        columnName !== 'id' &&
        (columnName.endsWith('_id') || columnName.endsWith('_uuid')) &&
        !coveredByForeignKey(table, columnName) &&
        !isGeneratedAlias(table, key, column.generatedExpression) &&
        !(
          table.relationKind === 'partitioned table' &&
          PARTITION_FOREIGN_KEY_COLUMNS.has(key) &&
          options.verifiedPartitionForeignKeys?.has(key)
        )
      ) {
        checkCategory(
          key,
          'UUID reference without a target foreign key',
          ALLOWED_NONRELATION_UUID,
          EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
          missingForeignKey,
          errors,
        )
      }
      if (
        (columnName === 'uuid_value' && 'kind' in table.columns) ||
        /^(?:work|entity|relation|target)_key$/u.test(columnName)
      ) {
        checkCategory(
          key,
          'encoded entity reference',
          new Set(),
          EXISTING_RELATIONAL_STORAGE_DEBT.encodedReference,
          encodedReference,
          errors,
        )
      }
    }
  }

  if (options.enforceCatalogFreshness !== false) {
    checkDisjoint(ALLOWED_OPAQUE_JSON, EXISTING_RELATIONAL_STORAGE_DEBT.json, 'JSON', errors)
    checkDisjoint(
      ALLOWED_NONRELATION_UUID,
      EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
      'UUID',
      errors,
    )
    checkFreshness('opaque JSON', ALLOWED_OPAQUE_JSON, json, errors)
    checkFreshness('JSON remediation', EXISTING_RELATIONAL_STORAGE_DEBT.json, json, errors)
    checkFreshness(
      'UUID array remediation',
      EXISTING_RELATIONAL_STORAGE_DEBT.uuidArray,
      uuidArray,
      errors,
    )
    checkFreshness('nonrelationship UUID', ALLOWED_NONRELATION_UUID, missingForeignKey, errors)
    for (const [key, expression] of GENERATED_FK_ALIASES) {
      const [tableName, columnName] = key.split('.')
      const table = schema.tables[tableName]
      if (
        table &&
        isGeneratedAlias(table, key, table.columns[columnName]?.generatedExpression ?? null)
      )
        continue
      errors.push(
        diagnostic(key, `stale or invalid generated FK alias catalog entry: ${expression}`),
      )
    }
    for (const key of PARTITION_FOREIGN_KEY_COLUMNS) {
      if (
        options.verifiedPartitionForeignKeys?.has(key) &&
        schema.tables[key.split('.')[0]]?.columns[key.split('.')[1]]
      )
        continue
      errors.push(diagnostic(key, 'partition FK proof is missing or stale'))
    }
    checkFreshness(
      'missing foreign key remediation',
      EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
      missingForeignKey,
      errors,
    )
    checkFreshness(
      'encoded reference remediation',
      EXISTING_RELATIONAL_STORAGE_DEBT.encodedReference,
      encodedReference,
      errors,
    )
  }
  return errors
}
