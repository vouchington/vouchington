import { describe, expect, it } from 'vitest'
import { canCurrentUserSeeDownvotes } from './can-see-downvotes'
import type { User } from '@/types/user'

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 'u1', roles: [], ...overrides }
}

describe('canCurrentUserSeeDownvotes', () => {
  it('returns false for null (anonymous viewer)', () => {
    expect(canCurrentUserSeeDownvotes(null)).toBe(false)
  })

  it('returns false for free signed-in user (no membership_plan)', () => {
    expect(canCurrentUserSeeDownvotes(makeUser({ membership_plan: null }))).toBe(false)
  })

  it('returns false for free signed-in user (membership_plan undefined)', () => {
    expect(canCurrentUserSeeDownvotes(makeUser())).toBe(false)
  })

  it('returns true for paid member (plus)', () => {
    expect(canCurrentUserSeeDownvotes(makeUser({ membership_plan: 'plus' }))).toBe(true)
  })

  it('returns true for paid member (pro)', () => {
    expect(canCurrentUserSeeDownvotes(makeUser({ membership_plan: 'pro' }))).toBe(true)
  })

  it('returns true for administrator regardless of membership_plan', () => {
    expect(canCurrentUserSeeDownvotes(makeUser({ roles: ['administrator'] }))).toBe(true)
  })

  it('returns true for administrator with null membership_plan', () => {
    expect(
      canCurrentUserSeeDownvotes(makeUser({ roles: ['administrator'], membership_plan: null })),
    ).toBe(true)
  })
})
