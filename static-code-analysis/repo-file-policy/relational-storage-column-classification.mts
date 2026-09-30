import type { SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import {
  ALLOWED_AUDIT_SNAPSHOT_ID,
  ALLOWED_NONRELATION_UUID,
  ALLOWED_OWN_PRIMARY_UUID,
  ALLOWED_TOKEN_CURSOR_PROTOCOL_ID,
  PARTITION_FOREIGN_KEY_COLUMNS,
} from './relational-storage-catalog.mts'
import {
  ENCODED_KEY_NAME,
  coveredByForeignKey,
  isEncodedText,
  isGeneratedAlias,
  isIndependentlyGenerated,
  isSolePrimaryKey,
  relationalStorageDiagnostic,
  typeBase,
  type ObservedRelationalColumns,
  type RelationalStorageOptions,
} from './relational-storage-type-rules.mts'

type Catalog = ReadonlySet<string>

const ACCEPTED_UUID_REFERENCE: Catalog = new Set([
  ...ALLOWED_NONRELATION_UUID,
  ...ALLOWED_TOKEN_CURSOR_PROTOCOL_ID.keys(),
  ...ALLOWED_AUDIT_SNAPSHOT_ID.keys(),
])
// An encoded key is accepted only as a reviewed token; audit snapshots are always UUID columns.
const ACCEPTED_ENCODED_REFERENCE: Catalog = new Set(ALLOWED_TOKEN_CURSOR_PROTOCOL_ID.keys())

function checkCategory(
  key: string,
  kind: string,
  accepted: Catalog,
  observed: Set<string>,
  errors: string[],
): void {
  observed.add(key)
  if (accepted.has(key)) return
  errors.push(
    relationalStorageDiagnostic(
      key,
      `${kind} needs concrete relational storage or an exact reviewed exception`,
    ),
  )
}

export function classifyRelationalColumn(
  key: string,
  columnName: string,
  column: SchemaTableSnapshot['columns'][string],
  table: SchemaTableSnapshot,
  options: RelationalStorageOptions,
  observed: ObservedRelationalColumns,
  errors: string[],
): void {
  const type = column.type.toLowerCase()
  if (
    typeBase(type) === 'uuid' &&
    columnName === 'id' &&
    isSolePrimaryKey(table, columnName) &&
    !isIndependentlyGenerated(column) &&
    !coveredByForeignKey(table, columnName)
  ) {
    checkCategory(
      key,
      'shared primary key without a target foreign key',
      ALLOWED_OWN_PRIMARY_UUID,
      observed.ownPrimary,
      errors,
    )
  }
  if (
    typeBase(type) === 'uuid' &&
    ENCODED_KEY_NAME.test(columnName) &&
    !coveredByForeignKey(table, columnName)
  ) {
    checkCategory(
      key,
      'UUID reference without a target foreign key',
      ACCEPTED_UUID_REFERENCE,
      observed.missingForeignKey,
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
      ACCEPTED_UUID_REFERENCE,
      observed.missingForeignKey,
      errors,
    )
  }
  if (
    (columnName === 'uuid_value' &&
      'kind' in table.columns &&
      !coveredByForeignKey(table, columnName)) ||
    (ENCODED_KEY_NAME.test(columnName) && isEncodedText(type)) ||
    key === 'copyright_notice_targets.placement_key'
  ) {
    checkCategory(
      key,
      'encoded entity reference',
      ACCEPTED_ENCODED_REFERENCE,
      observed.encodedReference,
      errors,
    )
  }
}
