/* v8 ignore start -- test support module exercised by schema-static-analysis.test.mts */
import { ALLOWED_UUID_COLUMNS_WITHOUT_KEYS } from './uuid-allowlists.mts'
import { NON_DEFAULT_ID_EXCEPTIONS } from '../../../schema-growth-test-policies.mts'
import {
  ALLOWED_MISSING_CREATED_AT,
  ALLOWED_NON_UUIDV7_CREATED_AT,
} from './timestamp-allowlists.mts'

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
  return false
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

/* v8 ignore stop */
