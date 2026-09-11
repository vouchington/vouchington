import { describe, it, expect } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import { currentUserCanSetVoteWeight } from './authorization.mts'

describe('currentUserCanSetVoteWeight', () => {
  it('returns false for null', () => {
    expect(currentUserCanSetVoteWeight(null)).toBe(false)
  })

  it('returns false for user without administrator role', () => {
    const user = { roles: [] } as unknown as PrivateUser
    expect(currentUserCanSetVoteWeight(user)).toBe(false)
  })

  it('returns false for user with other roles', () => {
    const user = { roles: ['moderator'] } as unknown as PrivateUser
    expect(currentUserCanSetVoteWeight(user)).toBe(false)
  })

  it('returns true for user with administrator role', () => {
    const user = { roles: ['administrator'] } as unknown as PrivateUser
    expect(currentUserCanSetVoteWeight(user)).toBe(true)
  })
})
