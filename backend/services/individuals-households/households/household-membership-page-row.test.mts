import { describe, expect, it } from 'vitest'
import {
  isAuthorizedHouseholdMembershipCursorRow,
  type HouseholdMembershipPageSqlRow,
} from './household-membership-page-row.mts'

describe('household membership cursor authorization', () => {
  const row: HouseholdMembershipPageSqlRow = {
    id: crypto.randomUUID(),
    household_id: crypto.randomUUID(),
    relationship: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    cursor_updated_at: '2026-01-01T00:00:00.000000Z',
    individual: {
      id: crypto.randomUUID(),
      user_id: null,
      username: null,
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    household_exists: true,
    can_view: true,
  }

  it('accepts only literal boolean authorization from the SQL row', () => {
    expect(isAuthorizedHouseholdMembershipCursorRow(row)).toBe(true)
    expect(isAuthorizedHouseholdMembershipCursorRow({ ...row, household_exists: 'true' })).toBe(
      false,
    )
    expect(isAuthorizedHouseholdMembershipCursorRow({ ...row, can_view: 'true' })).toBe(false)
  })
})
