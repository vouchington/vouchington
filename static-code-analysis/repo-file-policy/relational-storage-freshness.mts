import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import {
  ALLOWED_AUDIT_SNAPSHOT_ID,
  ALLOWED_NONRELATION_UUID,
  ALLOWED_OWN_PRIMARY_UUID,
  ALLOWED_OPAQUE_JSON,
  ALLOWED_TOKEN_CURSOR_PROTOCOL_ID,
  GENERATED_FK_ALIASES,
  PARTITION_FOREIGN_KEY_COLUMNS,
} from './relational-storage-catalog.mts'
import {
  isGeneratedAlias,
  relationalStorageDiagnostic,
  type ObservedRelationalColumns,
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

function checkDisjoint(first: Catalog, second: Catalog, label: string, errors: string[]): void {
  for (const key of first) {
    if (!second.has(key)) continue
    errors.push(relationalStorageDiagnostic(key, `duplicate ${label} catalog entry`))
  }
}

// Each reviewed id needs an exact live column and no second classification.
function appendReviewedIdFreshness(observed: ObservedRelationalColumns, errors: string[]): void {
  const tokenColumns = new Set([...observed.missingForeignKey, ...observed.encodedReference])
  const tokens = new Set(ALLOWED_TOKEN_CURSOR_PROTOCOL_ID.keys())
  const audits = new Set(ALLOWED_AUDIT_SNAPSHOT_ID.keys())
  checkFreshness('token, cursor or protocol identifier', tokens, tokenColumns, errors)
  checkFreshness('audit snapshot identifier', audits, observed.missingForeignKey, errors)
  for (const reviewed of [tokens, audits]) {
    checkDisjoint(reviewed, ALLOWED_NONRELATION_UUID, 'reviewed identifier', errors)
  }
  checkDisjoint(tokens, audits, 'reviewed identifier', errors)
}

export function appendCatalogFreshness(
  schema: SchemaSnapshot,
  observed: ObservedRelationalColumns,
  errors: string[],
  options: RelationalStorageOptions,
): void {
  checkFreshness('opaque JSON', ALLOWED_OPAQUE_JSON, observed.json, errors)
  checkFreshness(
    'nonrelationship UUID',
    ALLOWED_NONRELATION_UUID,
    observed.missingForeignKey,
    errors,
  )
  checkFreshness('own primary UUID', ALLOWED_OWN_PRIMARY_UUID, observed.ownPrimary, errors)
  appendReviewedIdFreshness(observed, errors)
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
}
