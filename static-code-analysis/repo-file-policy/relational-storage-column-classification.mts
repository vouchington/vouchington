import type { SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import {
  ALLOWED_NONRELATION_UUID,
  ALLOWED_OWN_PRIMARY_UUID,
  PARTITION_FOREIGN_KEY_COLUMNS,
} from './relational-storage-catalog.mts'
import { EXISTING_RELATIONAL_STORAGE_DEBT } from './relational-storage-debt.mts'
import {
  ENCODED_KEY_NAME,
  coveredByForeignKey,
  isEncodedText,
  isGeneratedAlias,
  isIndependentlyGenerated,
  isSolePrimaryKey,
  relationalStorageDiagnostic,
  typeBase,
  type ObservedRelationalDebt,
  type RelationalStorageOptions,
} from './relational-storage-type-rules.mts'

type Catalog = ReadonlySet<string>

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
  observed: ObservedRelationalDebt,
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
      new Set(),
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
      ALLOWED_NONRELATION_UUID,
      EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
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
      ALLOWED_NONRELATION_UUID,
      EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
      observed.missingForeignKey,
      errors,
    )
  }
  if (
    (columnName === 'uuid_value' &&
      'kind' in table.columns &&
      !coveredByForeignKey(table, columnName)) ||
    (ENCODED_KEY_NAME.test(columnName) && isEncodedText(type))
  ) {
    checkCategory(
      key,
      'encoded entity reference',
      new Set(),
      EXISTING_RELATIONAL_STORAGE_DEBT.encodedReference,
      observed.encodedReference,
      errors,
    )
  }
}

export { checkCategory }
