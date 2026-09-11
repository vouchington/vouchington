import { describe, it, expect } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanClaimTopic, currentUserCanReviewTopicClaims } from './authorization.mts'

function makeUser(roles: string[] = []): PrivateUser {
  return {
    id: crypto.randomUUID(),
    username: `user-${crypto.randomUUID().slice(0, 8)}`,
    roles,
  } as unknown as PrivateUser
}

describe('currentUserCanClaimTopic', () => {
  it('returns true for any authenticated user (non-null id)', () => {
    const user = makeUser([])
    expect(currentUserCanClaimTopic(user)).toBe(true)
  })

  it('returns true for administrator', () => {
    const user = makeUser(['administrator'])
    expect(currentUserCanClaimTopic(user)).toBe(true)
  })
})

describe('currentUserCanReviewTopicClaims', () => {
  it('returns true for administrator', () => {
    const user = makeUser(['administrator'])
    expect(currentUserCanReviewTopicClaims(user)).toBe(true)
  })

  it('returns true for moderator', () => {
    const user = makeUser(['moderator'])
    expect(currentUserCanReviewTopicClaims(user)).toBe(true)
  })

  it('returns false for regular member', () => {
    const user = makeUser(['member'])
    expect(currentUserCanReviewTopicClaims(user)).toBe(false)
  })

  it('returns false for empty roles', () => {
    const user = makeUser([])
    expect(currentUserCanReviewTopicClaims(user)).toBe(false)
  })
})
