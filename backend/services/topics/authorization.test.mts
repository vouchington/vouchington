import { it, expect, beforeAll, describe } from 'vitest'
import {
  currentUserCanCreateTopic,
  currentUserCanUpdateTopic,
  currentUserCanMergeTopic,
} from './authorization.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('authorization', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })
  describe('currentUserCanCreateTopic', () => {
    it('returns false when user is null', () => {
      const result = currentUserCanCreateTopic(null)
      expect(result).toBe(false)
    })

    it('returns false when user is not an admin', () => {
      const result = currentUserCanCreateTopic(user)
      expect(result).toBe(false)
    })

    it('returns true when user is an admin', () => {
      const result = currentUserCanCreateTopic(admin)
      expect(result).toBe(true)
    })
  })

  describe('currentUserCanUpdateTopic', () => {
    it('returns false when user is null', () => {
      const result = currentUserCanUpdateTopic(null)
      expect(result).toBe(false)
    })

    it('returns false when user is not an admin', () => {
      const result = currentUserCanUpdateTopic(user)
      expect(result).toBe(false)
    })

    it('returns true when user is an admin', () => {
      const result = currentUserCanUpdateTopic(admin)
      expect(result).toBe(true)
    })
  })

  describe('currentUserCanMergeTopic', () => {
    it('returns false when user is null', () => {
      const result = currentUserCanMergeTopic(null)
      expect(result).toBe(false)
    })

    it('returns false when user is not an admin', () => {
      const result = currentUserCanMergeTopic(user)
      expect(result).toBe(false)
    })

    it('returns true when user is an admin', () => {
      const result = currentUserCanMergeTopic(admin)
      expect(result).toBe(true)
    })
  })
})
