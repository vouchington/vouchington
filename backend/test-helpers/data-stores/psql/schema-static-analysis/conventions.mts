/* v8 ignore start -- test support module exercised by schema-static-analysis.test.mts */
import {
  ALLOWED_UNCOMMENTED_COLUMNS,
  ALLOWED_UNCOMMENTED_RELATIONS,
  ALLOWED_UUID_COLUMNS_WITHOUT_KEYS,
  COMMENT_EXEMPT_COLUMN_NAMES,
  COMMENT_EXEMPT_COLUMN_PATTERNS,
} from './uuid-allowlists.mts'
import { NON_DEFAULT_ID_EXCEPTIONS } from '../../../../data-stores/psql/schema-growth-classification.mts'
import {
  ALLOWED_MISSING_CREATED_AT,
  ALLOWED_MISSING_UPDATED_AT,
  ALLOWED_NON_UUIDV7_CREATED_AT,
} from './timestamp-allowlists.mts'

export { COMMENT_EXEMPT_COLUMN_NAMES }

export type CommentViolation = {
  kind: string
  relation_name: string
  column_name: string | null
}

export type UuidConventionViolation = {
  table_name: string
  column_name: string
  problem: string
}

export type TimestampConventionViolation = {
  table_name: string
  problem: string
  detail: string | null
}

export function isAllowedCommentViolation(violation: CommentViolation): boolean {
  if (isGeneratedRelationTable(violation.relation_name)) return true
  if (isGeneratedVoteTable(violation.relation_name)) return true
  if (violation.relation_name === 'migrations') return true
  if (violation.column_name != null && isConventionallyNamedColumn(violation.column_name)) {
    return true
  }
  const key = getCommentViolationKey(violation)
  if (violation.column_name == null) return ALLOWED_UNCOMMENTED_RELATIONS.has(key)
  return ALLOWED_UNCOMMENTED_COLUMNS.has(key)
}

export function isAllowedUuidConventionViolation(violation: UuidConventionViolation): boolean {
  const key = `${violation.table_name}.${violation.column_name}`
  if (isGeneratedRelationTable(violation.table_name) && violation.column_name === 'id') return true
  if (
    isGeneratedVoteTable(violation.table_name) &&
    ['device_id', 'session_id'].includes(violation.column_name)
  ) {
    return true
  }
  if (violation.problem === 'uuid-id-without-uuidv7-default') {
    return (
      violation.column_name === 'id' &&
      NON_DEFAULT_ID_EXCEPTIONS.get(violation.table_name)?.policy === 'uuidv7'
    )
  }
  return ALLOWED_UUID_COLUMNS_WITHOUT_KEYS.has(key)
}

export function isAllowedTimestampConventionViolation(
  violation: TimestampConventionViolation,
): boolean {
  if (isGeneratedRelationTable(violation.table_name)) return true
  if (isGeneratedVoteTable(violation.table_name)) return true
  if (violation.problem === 'created-at-not-derived-from-uuidv7-id') {
    return ALLOWED_NON_UUIDV7_CREATED_AT.has(violation.table_name)
  }
  if (violation.problem === 'missing-created-at') {
    return ALLOWED_MISSING_CREATED_AT.has(violation.table_name)
  }
  if (violation.problem === 'missing-updated-at') {
    return ALLOWED_MISSING_UPDATED_AT.has(violation.table_name)
  }
  return false
}

export function formatCommentViolation(violation: CommentViolation): string {
  return `${violation.kind}:${getCommentViolationKey(violation)}`
}

export function formatUuidConventionViolation(violation: UuidConventionViolation): string {
  return `${violation.table_name}.${violation.column_name}: ${violation.problem}`
}

export function formatTimestampConventionViolation(
  violation: TimestampConventionViolation,
): string {
  return `${violation.table_name}: ${violation.problem}${
    violation.detail == null ? '' : ` (${violation.detail})`
  }`
}

function isGeneratedRelationTable(name: string): boolean {
  return name.startsWith('relation__')
}

function isGeneratedVoteTable(name: string): boolean {
  return name.endsWith('_votes')
}

function isConventionallyNamedColumn(name: string): boolean {
  if (COMMENT_EXEMPT_COLUMN_NAMES.includes(name)) return true
  return COMMENT_EXEMPT_COLUMN_PATTERNS.some(pattern => pattern.test(name))
}

function getCommentViolationKey(violation: CommentViolation): string {
  if (violation.column_name == null) return violation.relation_name
  return `${violation.relation_name}.${violation.column_name}`
}
/* v8 ignore stop */
