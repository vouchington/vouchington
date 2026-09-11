import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createConversation } from './create.mts'
import {
  currentUserCanViewConversation,
  currentUserCanUpdateConversation,
  currentUserCanDeleteConversation,
} from './authorization.mts'
import type { Conversation } from './types.mts'

describe('authorization', () => {
  let admin: PrivateUser
  let owner: PrivateUser
  let otherUser: PrivateUser
  let unlinkedConv: Conversation
  let linkedConv: Conversation

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    owner = await createTestUser()
    otherUser = await createTestUser()

    const suffix = crypto.randomUUID().slice(0, 8)

    unlinkedConv = await createConversation(owner.id, `Unlinked conv ${suffix}`)

    linkedConv = await createConversation(owner.id, `Linked conv ${suffix}`)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+conv-auth-test-${suffix}@voucha.ai`,
      userId: owner.id,
    })
    await insertTestSupportThread({ supportContactId: contact.id, conversationId: linkedConv.id })
  })

  describe('currentUserCanViewConversation', () => {
    it('returns false for null user', async () => {
      expect(await currentUserCanViewConversation(null, unlinkedConv)).toBe(false)
    })

    it('returns true for the owner', async () => {
      expect(await currentUserCanViewConversation(owner, unlinkedConv)).toBe(true)
    })

    it('returns false for a non-admin other user', async () => {
      expect(await currentUserCanViewConversation(otherUser, unlinkedConv)).toBe(false)
    })

    it('returns false for admin when conversation is not linked to a support thread', async () => {
      expect(await currentUserCanViewConversation(admin, unlinkedConv)).toBe(false)
    })

    it('returns true for admin when conversation is linked to a support thread', async () => {
      expect(await currentUserCanViewConversation(admin, linkedConv)).toBe(true)
    })
  })

  describe('currentUserCanUpdateConversation', () => {
    it('returns false for null user', async () => {
      expect(await currentUserCanUpdateConversation(null, unlinkedConv)).toBe(false)
    })

    it('returns true for the owner', async () => {
      expect(await currentUserCanUpdateConversation(owner, unlinkedConv)).toBe(true)
    })

    it('returns false for a non-admin other user', async () => {
      expect(await currentUserCanUpdateConversation(otherUser, unlinkedConv)).toBe(false)
    })

    it('returns false for admin when conversation is not linked to a support thread', async () => {
      expect(await currentUserCanUpdateConversation(admin, unlinkedConv)).toBe(false)
    })

    it('returns true for admin when conversation is linked to a support thread', async () => {
      expect(await currentUserCanUpdateConversation(admin, linkedConv)).toBe(true)
    })
  })

  describe('currentUserCanDeleteConversation', () => {
    it('returns false for null user', async () => {
      expect(await currentUserCanDeleteConversation(null, unlinkedConv)).toBe(false)
    })

    it('returns true for the owner', async () => {
      expect(await currentUserCanDeleteConversation(owner, unlinkedConv)).toBe(true)
    })

    it('returns false for a non-admin other user', async () => {
      expect(await currentUserCanDeleteConversation(otherUser, unlinkedConv)).toBe(false)
    })

    it('returns false for admin when conversation is not linked to a support thread', async () => {
      expect(await currentUserCanDeleteConversation(admin, unlinkedConv)).toBe(false)
    })

    it('returns true for admin when conversation is linked to a support thread', async () => {
      expect(await currentUserCanDeleteConversation(admin, linkedConv)).toBe(true)
    })
  })
})
