import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createTestUser } from '@voucha/test-helpers'
import {
  currentUserCanGrantMembership,
  currentUserCanViewMembershipHistory,
  currentUserCanRefundMembership,
} from './authorization.mts'

describe('authorization', () => {
  let admin: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
  })

  describe('currentUserCanGrantMembership', () => {
    it('returns false when user is null', () => {
      expect(currentUserCanGrantMembership(null)).toBe(false)
    })

    it('returns false for regular user', () => {
      expect(currentUserCanGrantMembership(user)).toBe(false)
    })

    it('returns true for admin', () => {
      expect(currentUserCanGrantMembership(admin)).toBe(true)
    })
  })

  describe('currentUserCanViewMembershipHistory', () => {
    it('returns false when user is null', () => {
      expect(currentUserCanViewMembershipHistory(null, user.id)).toBe(false)
    })

    it('returns false for regular user', () => {
      expect(currentUserCanViewMembershipHistory(user, user.id)).toBe(false)
    })

    it('returns true for admin', () => {
      expect(currentUserCanViewMembershipHistory(admin, user.id)).toBe(true)
    })
  })

  describe('currentUserCanRefundMembership', () => {
    it('returns false when user is null', () => {
      expect(currentUserCanRefundMembership(null)).toBe(false)
    })

    it('returns false for regular user', () => {
      expect(currentUserCanRefundMembership(user)).toBe(false)
    })

    it('returns true for admin', () => {
      expect(currentUserCanRefundMembership(admin)).toBe(true)
    })

    it('does not grant refund access to a former support role', () => {
      expect(currentUserCanRefundMembership({ ...user, roles: ['customer_support'] })).toBe(false)
    })
  })
})
