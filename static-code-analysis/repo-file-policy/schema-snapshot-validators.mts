import { createSchemaSnapshotValidation } from './schema-snapshot-validator-primitives.mts'

const referentialActions = ['no action', 'restrict', 'cascade', 'set null', 'set default'] as const

export function validateSnapshot(snapshot: unknown, schemaSnapshotPath: string): string[] {
  const {
    addError,
    diagnostic,
    isRecord,
    oneOf,
    validateArray,
    validateBoolean,
    validateNullable,
    validateNullableOneOf,
    validateNullableString,
    validateOneOf,
    validateRecord,
    validateString,
    validateStringArray,
    validateStringRecord,
  } = createSchemaSnapshotValidation(schemaSnapshotPath)

  const validateColumn = (value: unknown, path: string, errors: string[]): void => {
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

  const validateKeyConstraint = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateString(value.definition, `${path}.definition`, errors)
    validateStringArray(value.columns, `${path}.columns`, errors)
  }

  const validateForeignKey = (value: unknown, path: string, errors: string[]): void => {
    validateKeyConstraint(value, path, errors)
    if (!isRecord(value)) return
    validateString(value.referencedTable, `${path}.referencedTable`, errors)
    validateStringArray(value.referencedColumns, `${path}.referencedColumns`, errors)
    validateOneOf(value.onUpdate, `${path}.onUpdate`, referentialActions, errors)
    validateOneOf(value.onDelete, `${path}.onDelete`, referentialActions, errors)
    validateBoolean(value.validated, `${path}.validated`, errors)
  }

  const validateIndexKey = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateNullableString(value.column, `${path}.column`, errors)
    validateString(value.expression, `${path}.expression`, errors)
    validateString(value.opclass, `${path}.opclass`, errors)
    validateBoolean(value.descending, `${path}.descending`, errors)
    validateBoolean(value.nullsFirst, `${path}.nullsFirst`, errors)
  }

  const validateIndex = (value: unknown, path: string, errors: string[]): void => {
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

  const validatePhysicalPartition = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateOneOf(value.strategy, `${path}.strategy`, ['hash', 'list', 'range'], errors)
    validateString(value.key, `${path}.key`, errors)
  }

  const validatePartitionPolicy = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateOneOf(value.strategy, `${path}.strategy`, ['RANGE'], errors)
    validateString(value.key, `${path}.key`, errors)
    validateOneOf(value.children, `${path}.children`, ['default', 'monthly'], errors)
    validateNullableOneOf(
      value.retentionOwner,
      `${path}.retentionOwner`,
      ['cleanupPartitions', 'runDataRetentionCleanup', 'operatorPartitionDrop'],
      errors,
    )
    validateOneOf(
      value.accessClass,
      `${path}.accessClass`,
      ['target-scoped', 'retention-window', 'intentional-fanout'],
      errors,
    )
  }

  const validateView = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateString(value.definition, `${path}.definition`, errors)
    validateNullableString(value.comment, `${path}.comment`, errors)
    validateBoolean(value.materialized, `${path}.materialized`, errors)
  }

  const validateEnum = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateStringArray(value.values, `${path}.values`, errors)
  }

  const validateExtension = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateString(value.version, `${path}.version`, errors)
  }

  const validateFunction = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateString(value.definition, `${path}.definition`, errors)
  }

  const validatePolicy = (value: unknown, path: string, errors: string[]): void => {
    if (!isRecord(value)) return addError(errors, `${path} must be an object`)
    validateString(value.table, `${path}.table`, errors)
    validateString(value.command, `${path}.command`, errors)
    validateStringArray(value.pgRoles, `${path}.pgRoles`, errors)
    validateNullableString(value.using, `${path}.using`, errors)
    validateNullableString(value.withCheck, `${path}.withCheck`, errors)
  }

  const validateTable = (value: unknown, path: string, errors: string[]): void => {
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

  const errors: string[] = []
  if (!isRecord(snapshot)) return [diagnostic('snapshot must be an object')]
  if (snapshot.formatVersion !== 2) addError(errors, 'formatVersion must be 2')

  validateRecord(snapshot.tables, 'tables', errors, validateTable)
  validateRecord(snapshot.views, 'views', errors, validateView)
  validateRecord(snapshot.enums, 'enums', errors, validateEnum)
  validateRecord(snapshot.extensions, 'extensions', errors, validateExtension)
  validateRecord(snapshot.functions, 'functions', errors, validateFunction)
  validateRecord(snapshot.policies, 'policies', errors, validatePolicy)
  return errors
}
