import { describe, expect, it } from 'vitest'
import { isAdmin, isModerationStaff } from './official-account'

describe('isAdmin', () => {
  it('returns false for null', () => {
    expect(isAdmin(null)).toBe(false)
  })

  it('returns false for user with no roles', () => {
    expect(isAdmin({ roles: [] })).toBe(false)
  })

  it('returns true for user with administrator role', () => {
    expect(isAdmin({ roles: ['administrator'] })).toBe(true)
  })

  it('returns false for user with non-admin role', () => {
    expect(isAdmin({ roles: ['moderator'] })).toBe(false)
  })
})

describe('isModerationStaff', () => {
  it('returns false for null', () => {
    expect(isModerationStaff(null)).toBe(false)
  })

  it('returns false for user with no roles', () => {
    expect(isModerationStaff({ roles: [] })).toBe(false)
  })

  it('returns true for user with administrator role', () => {
    expect(isModerationStaff({ roles: ['administrator'] })).toBe(true)
  })

  it('returns true for user with moderator role', () => {
    expect(isModerationStaff({ roles: ['moderator'] })).toBe(true)
  })

  it('returns false for user with unrelated role', () => {
    expect(isModerationStaff({ roles: ['member'] })).toBe(false)
  })
})
