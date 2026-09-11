import { describe, expect, it } from 'vitest'
import { currentUserCanViewAiCosts } from '../authorization.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

function makeUser(roles: string[]): PrivateUser {
  return { roles } as unknown as PrivateUser
}

describe('currentUserCanViewAiCosts', () => {
  it('returns false for null user', () => {
    expect(currentUserCanViewAiCosts(null)).toBe(false)
  })

  it('returns false for a non-admin user', () => {
    expect(currentUserCanViewAiCosts(makeUser(['user']))).toBe(false)
  })

  it('returns true for an administrator', () => {
    expect(currentUserCanViewAiCosts(makeUser(['administrator']))).toBe(true)
  })
})
