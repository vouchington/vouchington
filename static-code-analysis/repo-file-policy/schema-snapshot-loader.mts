import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

/* oxlint-disable max-lines -- Recursive validation keeps the fail-closed artifact contract auditable in one module. */
export const SCHEMA_SNAPSHOT_PATH = 'backend/data-stores/psql/schema-snapshot/schema.json'

const referentialActions = ['no action', 'restrict', 'cascade', 'set null', 'set default'] as const

type SchemaSnapshotLoadResult =
  | { snapshot: SchemaSnapshot; errors: [] }
  | { snapshot: null; errors: string[] }

/**
 * This intentionally validates the complete v2 artifact contract rather than
 * trusting a JSON cast. Static analysis must fail closed on stale or malformed facts.
 */
export function loadSchemaSnapshot(
  repoRoot: string,
  trackedFileSet: ReadonlySet<string>,
  injectedSnapshot?: unknown,
): SchemaSnapshotLoadResult {
  let value = injectedSnapshot
  if (value === undefined) {
    if (!trackedFileSet.has(SCHEMA_SNAPSHOT_PATH)) {
      return failed(`${SCHEMA_SNAPSHOT_PATH}: generated PostgreSQL schema snapshot must be tracked`)
    }
    try {
      value = JSON.parse(readFileSync(join(repoRoot, SCHEMA_SNAPSHOT_PATH), 'utf8'))
    } catch (error) {
      return failed(
        `${SCHEMA_SNAPSHOT_PATH}: could not read valid JSON (${error instanceof Error ? error.message : String(error)})`,
      )
    }
  }

  const errors = validateSnapshot(value)
  return errors.length === 0
    ? { snapshot: value as SchemaSnapshot, errors: [] }
    : { snapshot: null, errors }
}

function failed(message: string): SchemaSnapshotLoadResult {
  return { snapshot: null, errors: [diagnostic(message)] }
}

function validateSnapshot(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return [diagnostic('snapshot must be an object')]
  if (value.formatVersion !== 2) addError(errors, 'formatVersion must be 2')

  validateRecord(value.tables, 'tables', errors, validateTable)
  validateRecord(value.views, 'views', errors, validateView)
  validateRecord(value.enums, 'enums', errors, validateEnum)
  validateRecord(value.extensions, 'extensions', errors, validateExtension)
  validateRecord(value.functions, 'functions', errors, validateFunction)
  validateRecord(value.policies, 'policies', errors, validatePolicy)
  return errors
}

function validateTable(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  if (!oneOf(value.relationKind, ['table', 'partitioned table'])) {
    addError(errors, `${path}.relationKind must be table or partitioned table`)
  }
  validateRecord(value.columns, `${path}.columns`, errors, validateColumn)
  validateNullable(value.primaryKey, `${path}.primaryKey`, errors, validateKeyConstraint)
  validateRecord(
    value.uniqueConstraints,
    `${path}.uniqueConstraints`,
    errors,
    validateKeyConstraint,
  )
  validateStringRecord(value.checkConstraints, `${path}.checkConstraints`, errors)
  validateRecord(value.foreignKeys, `${path}.foreignKeys`, errors, validateForeignKey)
  validateRecord(value.indexes, `${path}.indexes`, errors, validateIndex)
  validateStringRecord(value.triggers, `${path}.triggers`, errors)
  validateNullableString(value.comment, `${path}.comment`, errors)
  validateNullable(
    value.physicalPartition,
    `${path}.physicalPartition`,
    errors,
    validatePhysicalPartition,
  )
  validateNullable(value.partition, `${path}.partition`, errors, validatePartitionPolicy)
  if (!oneOf(value.growth, ['bounded', 'unbounded'])) {
    addError(errors, `${path}.growth must be bounded or unbounded`)
  }
}

function validateColumn(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateString(value.type, `${path}.type`, errors)
  validateBoolean(value.nullable, `${path}.nullable`, errors)
  validateNullableString(value.defaultExpression, `${path}.defaultExpression`, errors)
  validateNullableString(value.generatedExpression, `${path}.generatedExpression`, errors)
  validateNullableOneOf(value.identity, `${path}.identity`, ['always', 'by default'], errors)
  validateNullableOneOf(value.generated, `${path}.generated`, ['stored', 'virtual'], errors)
  validateNullableString(value.collation, `${path}.collation`, errors)
  validateNullableString(value.comment, `${path}.comment`, errors)
  if (!Number.isInteger(value.ordinalPosition)) {
    addError(errors, `${path}.ordinalPosition must be an integer`)
  }
}

function validateKeyConstraint(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateString(value.definition, `${path}.definition`, errors)
  validateStringArray(value.columns, `${path}.columns`, errors)
}

function validateForeignKey(value: unknown, path: string, errors: string[]): void {
  validateKeyConstraint(value, path, errors)
  if (!isRecord(value)) return
  validateString(value.referencedTable, `${path}.referencedTable`, errors)
  validateStringArray(value.referencedColumns, `${path}.referencedColumns`, errors)
  validateOneOf(value.onUpdate, `${path}.onUpdate`, referentialActions, errors)
  validateOneOf(value.onDelete, `${path}.onDelete`, referentialActions, errors)
  validateBoolean(value.validated, `${path}.validated`, errors)
}

function validateIndex(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateString(value.definition, `${path}.definition`, errors)
  validateString(value.accessMethod, `${path}.accessMethod`, errors)
  validateBoolean(value.unique, `${path}.unique`, errors)
  validateBoolean(value.primary, `${path}.primary`, errors)
  validateBoolean(value.constraintBacked, `${path}.constraintBacked`, errors)
  validateBoolean(value.valid, `${path}.valid`, errors)
  validateBoolean(value.ready, `${path}.ready`, errors)
  validateArray(value.keys, `${path}.keys`, errors, validateIndexKey)
  validateStringArray(value.includedColumns, `${path}.includedColumns`, errors)
  validateNullableString(value.predicate, `${path}.predicate`, errors)
}

function validateIndexKey(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateNullableString(value.column, `${path}.column`, errors)
  validateString(value.expression, `${path}.expression`, errors)
  validateString(value.opclass, `${path}.opclass`, errors)
  validateBoolean(value.descending, `${path}.descending`, errors)
  validateBoolean(value.nullsFirst, `${path}.nullsFirst`, errors)
}

function validatePhysicalPartition(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateOneOf(value.strategy, `${path}.strategy`, ['hash', 'list', 'range'], errors)
  validateString(value.key, `${path}.key`, errors)
}

function validatePartitionPolicy(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateOneOf(value.strategy, `${path}.strategy`, ['RANGE', 'LIST -> RANGE'], errors)
  validateString(value.key, `${path}.key`, errors)
  validateOneOf(
    value.children,
    `${path}.children`,
    ['default', 'monthly', 'list-default-range'],
    errors,
  )
  validateNullableOneOf(
    value.retentionOwner,
    `${path}.retentionOwner`,
    ['cleanupPartitions'],
    errors,
  )
  validateOneOf(
    value.accessClass,
    `${path}.accessClass`,
    ['target-scoped', 'retention-window', 'intentional-fanout'],
    errors,
  )
}

function validateView(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateString(value.definition, `${path}.definition`, errors)
  validateNullableString(value.comment, `${path}.comment`, errors)
  validateBoolean(value.materialized, `${path}.materialized`, errors)
}

function validateEnum(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateStringArray(value.values, `${path}.values`, errors)
}

function validateExtension(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateString(value.version, `${path}.version`, errors)
}

function validateFunction(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateString(value.definition, `${path}.definition`, errors)
}

function validatePolicy(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  validateString(value.table, `${path}.table`, errors)
  validateString(value.command, `${path}.command`, errors)
  validateStringArray(value.pgRoles, `${path}.pgRoles`, errors)
  validateNullableString(value.using, `${path}.using`, errors)
  validateNullableString(value.withCheck, `${path}.withCheck`, errors)
}

function validateRecord(
  value: unknown,
  path: string,
  errors: string[],
  validateValue: (value: unknown, path: string, errors: string[]) => void,
): void {
  if (!isRecord(value)) return addError(errors, `${path} must be an object`)
  for (const [key, entry] of Object.entries(value)) validateValue(entry, `${path}.${key}`, errors)
}

function validateStringRecord(value: unknown, path: string, errors: string[]): void {
  validateRecord(value, path, errors, validateString)
}

function validateArray(
  value: unknown,
  path: string,
  errors: string[],
  validateValue: (value: unknown, path: string, errors: string[]) => void,
): void {
  if (!Array.isArray(value)) return addError(errors, `${path} must be an array`)
  for (const [index, entry] of value.entries()) validateValue(entry, `${path}[${index}]`, errors)
}

function validateStringArray(value: unknown, path: string, errors: string[]): void {
  validateArray(value, path, errors, validateString)
}

function validateNullable(
  value: unknown,
  path: string,
  errors: string[],
  validateValue: (value: unknown, path: string, errors: string[]) => void,
): void {
  if (value !== null) validateValue(value, path, errors)
}

function validateString(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string') addError(errors, `${path} must be a string`)
}

function validateNullableString(value: unknown, path: string, errors: string[]): void {
  if (value !== null && typeof value !== 'string')
    addError(errors, `${path} must be a string or null`)
}

function validateBoolean(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'boolean') addError(errors, `${path} must be a boolean`)
}

function validateOneOf(
  value: unknown,
  path: string,
  values: readonly string[],
  errors: string[],
): void {
  if (!oneOf(value, values)) addError(errors, `${path} must be one of ${values.join(', ')}`)
}

function validateNullableOneOf(
  value: unknown,
  path: string,
  values: readonly string[],
  errors: string[],
): void {
  if (value !== null) validateOneOf(value, path, values, errors)
}

function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === 'string' && values.includes(value)
}

function addError(errors: string[], message: string): void {
  errors.push(diagnostic(message))
}

function diagnostic(message: string): string {
  return `::error file=${SCHEMA_SNAPSHOT_PATH}::${SCHEMA_SNAPSHOT_PATH}: ${message}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
