import { isPreciseTimestampString } from '@modules/pagination'
import { isUUID } from '@modules/utils/ids'
import type { HouseholdMembershipRow } from '../types.mts'

export type HouseholdMembershipPageSqlRow = {
  id: string | null
  household_id: string | null
  relationship: string | null
  updated_at: string | null
  cursor_updated_at: string | null
  individual: unknown
  household_exists: boolean
  can_view: boolean
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
