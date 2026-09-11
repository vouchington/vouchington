import { describe, it, expect } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanResolveReviewDispute } from './authorization.mts'

function makeUser(roles: string[]): PrivateUser {
  return {
    id: crypto.randomUUID(),
    username: `user-${crypto.randomUUID().slice(0, 8)}`,
    roles,
  } as unknown as PrivateUser
}

describe('currentUserCanResolveReviewDispute', () => {
  it('returns true for administrator', () => {
    const user = makeUser(['administrator'])
    expect(currentUserCanResolveReviewDispute(user)).toBe(true)
  })

  it('returns true for moderator', () => {
    const user = makeUser(['moderator'])
    expect(currentUserCanResolveReviewDispute(user)).toBe(true)
  })

  it('returns false for regular user with no staff roles', () => {
    const user = makeUser(['member'])
    expect(currentUserCanResolveReviewDispute(user)).toBe(false)
  })

  it('returns false for user with empty roles array', () => {
    const user = makeUser([])
    expect(currentUserCanResolveReviewDispute(user)).toBe(false)
  })

  it('returns false for null user', () => {
    expect(currentUserCanResolveReviewDispute(null)).toBe(false)
  })
})
