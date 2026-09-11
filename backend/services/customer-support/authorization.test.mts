import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  currentUserCanManageSupport,
  currentUserCanViewSupportThread,
  currentUserCanCreateSupportThread,
} from './authorization.mts'
import type { SupportThread } from './types.mts'

describe('authorization', () => {
  let adminUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  const dummyThread: SupportThread = {
    id: '00000000-0000-0000-0000-000000000099',
    support_contact_id: '00000000-0000-0000-0000-000000000001',
    subject: 'Test',
    conversation_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    assigned_at: null,
    assigned_to_id: null,
    resolved_at: null,
    resolved_by_id: null,
    status: 'open',
  }

  describe('currentUserCanManageSupport', () => {
    it('returns true for administrator', () => {
      expect(currentUserCanManageSupport(adminUser)).toBe(true)
    })

    it('returns false for regular user', () => {
      expect(currentUserCanManageSupport(regularUser)).toBe(false)
    })

    it('returns false for null user', () => {
      expect(currentUserCanManageSupport(null)).toBe(false)
    })
  })

  describe('currentUserCanViewSupportThread', () => {
    it('returns true for administrator', () => {
      expect(currentUserCanViewSupportThread(adminUser, dummyThread, null)).toBe(true)
    })

    it('returns true for the contact user', () => {
      expect(currentUserCanViewSupportThread(regularUser, dummyThread, regularUser.id)).toBe(true)
    })

    it('returns false for a different regular user', () => {
      expect(currentUserCanViewSupportThread(regularUser, dummyThread, adminUser.id)).toBe(false)
    })

    it('returns false for null user', () => {
      expect(currentUserCanViewSupportThread(null, dummyThread, regularUser.id)).toBe(false)
    })
  })

  describe('currentUserCanCreateSupportThread', () => {
    it('returns true for authenticated user', () => {
      expect(currentUserCanCreateSupportThread(regularUser)).toBe(true)
    })

    it('returns true for administrator', () => {
      expect(currentUserCanCreateSupportThread(adminUser)).toBe(true)
    })

    it('returns false for null user', () => {
      expect(currentUserCanCreateSupportThread(null)).toBe(false)
    })
  })
})
