import { it, expect, describe } from 'vitest'
import { currentUserCanViewReferralClickLog } from './authorization.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('authorization', () => {
  function makeUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
    return {
      __entity_type: 'user',
      id: 'user-1',
      username: 'testuser',
      roles: [],
      ...overrides,
    } as unknown as PrivateUser
  }

  it('currentUserCanViewReferralClickLog - owner can view own log', () => {
    const user = makeUser({ id: 'user-1' })
    expect(currentUserCanViewReferralClickLog(user, 'user-1')).toBe(true)
  })

  it('currentUserCanViewReferralClickLog - user cannot view another user log', () => {
    const user = makeUser({ id: 'user-1' })
    expect(currentUserCanViewReferralClickLog(user, 'user-2')).toBe(false)
  })

  it('currentUserCanViewReferralClickLog - admin can view any log', () => {
    const admin = makeUser({ id: 'admin-1', roles: ['administrator'] })
    expect(currentUserCanViewReferralClickLog(admin, 'user-2')).toBe(true)
  })

  it('currentUserCanViewReferralClickLog - unauthenticated user cannot view', () => {
    expect(currentUserCanViewReferralClickLog(null, 'user-1')).toBe(false)
  })
})
