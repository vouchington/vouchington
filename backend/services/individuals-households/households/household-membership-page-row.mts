import { isPreciseTimestampString } from '@modules/pagination'
import { isUUID } from '@modules/utils/ids'
import type { HouseholdMembershipRow } from '../types.mts'

/** Precise membership timestamp shared by the list query and membership create. */
export function membershipUpdatedAtSql(alias: string): string {
  return `to_char(${sqlIdentifier(alias)}.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

/** Individual object shared by the list query and membership create. */
export function membershipIndividualSql(individualAlias: string, userAlias: string): string {
  const individual = sqlIdentifier(individualAlias)
  const user = sqlIdentifier(userAlias)
  return `json_build_object('id', ${individual}.id, 'user_id', ${user}.id, 'username', ${user}.username, 'updated_at', ${individual}.updated_at)`
}

function sqlIdentifier(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`Invalid SQL identifier: ${alias}`)
  }
  return alias
}

export type HouseholdMembershipPageSqlRow = {
  id: string | null
  household_id: string | null
  relationship: string | null
  updated_at: string | null
  cursor_updated_at: string | null
  individual: unknown
  household_exists: unknown
  can_view: unknown
}

type AuthorizedHouseholdMembershipCursorRow = HouseholdMembershipRow & {
  cursor_updated_at: string
  household_exists: true
  can_view: true
}

export function isAuthorizedHouseholdMembershipCursorRow(
  row: HouseholdMembershipPageSqlRow,
): row is AuthorizedHouseholdMembershipCursorRow {
  if (
    row.household_exists !== true ||
    row.can_view !== true ||
    typeof row.id !== 'string' ||
    !isUUID(row.id) ||
    typeof row.household_id !== 'string' ||
    !isUUID(row.household_id) ||
    (row.relationship !== null && typeof row.relationship !== 'string') ||
    typeof row.updated_at !== 'string' ||
    typeof row.cursor_updated_at !== 'string' ||
    !isPreciseTimestampString(row.cursor_updated_at) ||
    typeof row.individual !== 'object' ||
    row.individual === null
  ) {
    return false
  }
  const individual = row.individual as Record<string, unknown>
  return (
    typeof individual.id === 'string' &&
    isUUID(individual.id) &&
    (individual.user_id === null || typeof individual.user_id === 'string') &&
    (individual.username === null || typeof individual.username === 'string') &&
    typeof individual.updated_at === 'string'
  )
}
