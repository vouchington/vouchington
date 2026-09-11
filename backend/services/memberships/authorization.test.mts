import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createTestUser, createTestMembership } from '@voucha/test-helpers'
import {
  currentUserCanViewMembership,
  currentUserCanCancelMembership,
  currentUserCanGrantMembership,
  currentUserCanViewMembershipHistory,
  currentUserCanRefundMembership,
} from './authorization.mts'
import { getMembershipByUserId } from './get.mts'
import type { Membership } from './types.mts'

describe('authorization', () => {
  let admin: PrivateUser
  let user: PrivateUser
  let otherUser: PrivateUser
  let membership: Membership

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
    otherUser = await createTestUser()
    await createTestMembership({ user_id: user.id })
    membership = (await getMembershipByUserId(user.id))!
  })
  describe('currentUserCanViewMembership', () => {
    it('returns false when user is null', () => {
      expect(currentUserCanViewMembership(null, user.id)).toBe(false)
    })

    it('returns true when user is self', () => {
      expect(currentUserCanViewMembership(user, user.id)).toBe(true)
    })

    it('returns true when user is admin', () => {
      expect(currentUserCanViewMembership(admin, user.id)).toBe(true)
    })

    it('returns false for other user', () => {
      expect(currentUserCanViewMembership(otherUser, user.id)).toBe(false)
    })
  })

  describe('currentUserCanCancelMembership', () => {
    it('returns false when user is null', () => {
      expect(currentUserCanCancelMembership(null, membership)).toBe(false)
    })

    it('returns true when user owns membership', () => {
      expect(currentUserCanCancelMembership(user, membership)).toBe(true)
    })

    it('returns true when user is admin', () => {
      expect(currentUserCanCancelMembership(admin, membership)).toBe(true)
    })

    it('returns false for other user', () => {
      expect(currentUserCanCancelMembership(otherUser, membership)).toBe(false)
    })
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
    let customerSupport: PrivateUser

    beforeAll(async () => {
      customerSupport = await createTestUser({ extraRoles: ['customer_support'] })
    })

    it('returns false when user is null', () => {
      expect(currentUserCanRefundMembership(null)).toBe(false)
    })

    it('returns false for regular user', () => {
      expect(currentUserCanRefundMembership(user)).toBe(false)
    })

    it('returns true for admin', () => {
      expect(currentUserCanRefundMembership(admin)).toBe(true)
    })

    it('returns true for customer_support', () => {
      expect(currentUserCanRefundMembership(customerSupport)).toBe(true)
    })
  })
})
