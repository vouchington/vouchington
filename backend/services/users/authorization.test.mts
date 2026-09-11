import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createTestUser, insertEntityRelation } from '@voucha/test-helpers'
import {
  currentUserCanDeleteUser,
  currentUserCanUpdateUser,
  currentUserCanViewUserContent,
  isOfficialAccount,
  isOwnerOrAdmin,
} from './authorization.mts'

describe('authorization', () => {
  let admin: PrivateUser
  let targetUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    targetUser = await createTestUser()
  })
  describe('isOwnerOrAdmin', () => {
    it('returns false when currentUser is null', () => {
      expect(isOwnerOrAdmin(null, 'some-id')).toBe(false)
    })

    it('returns false when currentUser is null and ownerId is null', () => {
      expect(isOwnerOrAdmin(null, null)).toBe(false)
    })

    it('returns true when currentUser is an admin regardless of ownerId', () => {
      expect(isOwnerOrAdmin(admin, 'some-other-id')).toBe(true)
    })

    it('returns true when currentUser owns the resource', () => {
      expect(isOwnerOrAdmin(targetUser, targetUser.id)).toBe(true)
    })

    it('returns false when currentUser does not own the resource and is not admin', () => {
      expect(isOwnerOrAdmin(targetUser, admin.id)).toBe(false)
    })

    it('returns false when ownerId is null', () => {
      expect(isOwnerOrAdmin(targetUser, null)).toBe(false)
    })

    it('returns false when ownerId is undefined', () => {
      expect(isOwnerOrAdmin(targetUser, undefined)).toBe(false)
    })
  })

  describe('isOfficialAccount', () => {
    it('returns false for anonymous users and normal users', () => {
      expect(isOfficialAccount(null)).toBe(false)
      expect(isOfficialAccount({ roles: [] })).toBe(false)
      expect(isOfficialAccount({ roles: ['user'] })).toBe(false)
    })

    it('returns true for official role users, agents, and reserved system usernames', () => {
      expect(isOfficialAccount({ roles: ['investor'] })).toBe(true)
      expect(isOfficialAccount({ roles: [], is_agent: true })).toBe(true)
      expect(isOfficialAccount({ roles: [], username: 'system' })).toBe(true)
    })
  })

  describe('currentUserCanUpdateUser', () => {
    it('returns false when user is null', () => {
      expect(currentUserCanUpdateUser(null, targetUser)).toBe(false)
    })

    it('returns true when user is self', () => {
      expect(currentUserCanUpdateUser(targetUser, targetUser)).toBe(true)
    })

    it('returns true when user is an admin', () => {
      expect(currentUserCanUpdateUser(admin, targetUser)).toBe(true)
    })
  })

  describe('currentUserCanDeleteUser', () => {
    it('returns false when user is null', () => {
      expect(currentUserCanDeleteUser(null, targetUser)).toBe(false)
    })

    it('returns true when user is self', () => {
      expect(currentUserCanDeleteUser(targetUser, targetUser)).toBe(true)
    })

    it('returns true when user is an admin', () => {
      expect(currentUserCanDeleteUser(admin, targetUser)).toBe(true)
    })
  })

  describe('currentUserCanViewUserContent', () => {
    let contentOwner: PrivateUser
    let stranger: PrivateUser
    let follower: PrivateUser
    let mutualFollower: PrivateUser

    beforeAll(async () => {
      contentOwner = await createTestUser()
      stranger = await createTestUser()
      follower = await createTestUser()
      mutualFollower = await createTestUser()
      // follower → contentOwner (one-way)
      await insertEntityRelation('relation__user__follow__user', follower.id, contentOwner.id)
      // mutualFollower ↔ contentOwner (both directions)
      await insertEntityRelation('relation__user__follow__user', mutualFollower.id, contentOwner.id)
      await insertEntityRelation('relation__user__follow__user', contentOwner.id, mutualFollower.id)
    }, 60_000)
    it('everyone - returns true for anonymous', async () => {
      expect(await currentUserCanViewUserContent(null, contentOwner.id, 'everyone')).toBe(true)
    })

    it('everyone - returns true for logged-in user', async () => {
      expect(await currentUserCanViewUserContent(stranger, contentOwner.id, 'everyone')).toBe(true)
    })

    it('nobody - returns false for anonymous', async () => {
      expect(await currentUserCanViewUserContent(null, contentOwner.id, 'nobody')).toBe(false)
    })

    it('nobody - returns false for logged-in stranger', async () => {
      expect(await currentUserCanViewUserContent(stranger, contentOwner.id, 'nobody')).toBe(false)
    })

    it('nobody - returns true for self', async () => {
      expect(await currentUserCanViewUserContent(contentOwner, contentOwner.id, 'nobody')).toBe(
        true,
      )
    })

    it('nobody - returns true for admin', async () => {
      expect(await currentUserCanViewUserContent(admin, contentOwner.id, 'nobody')).toBe(true)
    })

    it('users - returns false for anonymous', async () => {
      expect(await currentUserCanViewUserContent(null, contentOwner.id, 'users')).toBe(false)
    })

    it('users - returns true for logged-in user', async () => {
      expect(await currentUserCanViewUserContent(stranger, contentOwner.id, 'users')).toBe(true)
    })

    it('followers - returns false for anonymous', async () => {
      expect(await currentUserCanViewUserContent(null, contentOwner.id, 'followers')).toBe(false)
    })

    it('followers - returns false for non-follower', async () => {
      expect(await currentUserCanViewUserContent(stranger, contentOwner.id, 'followers')).toBe(
        false,
      )
    })

    it('followers - returns true for follower', async () => {
      expect(await currentUserCanViewUserContent(follower, contentOwner.id, 'followers')).toBe(true)
    })

    it('mutual_followers - returns false for one-way follower', async () => {
      expect(
        await currentUserCanViewUserContent(follower, contentOwner.id, 'mutual_followers'),
      ).toBe(false)
    })

    it('mutual_followers - returns true when both follow each other', async () => {
      expect(
        await currentUserCanViewUserContent(mutualFollower, contentOwner.id, 'mutual_followers'),
      ).toBe(true)
    })
  })
})
