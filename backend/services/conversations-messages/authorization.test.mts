import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  currentUserCanDeleteConversation,
  currentUserCanUpdateConversation,
  currentUserCanViewConversation,
} from './authorization.mts'
import { createConversation } from './create.mts'
import type { Conversation } from './types.mts'

describe('conversation authorization', () => {
  let administrator: PrivateUser
  let owner: PrivateUser
  let otherUser: PrivateUser
  let conversation: Conversation

  beforeAll(async () => {
    administrator = await createTestUser({ administrator: true })
    owner = await createTestUser()
    otherUser = await createTestUser()

    conversation = await createConversation(owner.id, `Conversation ${crypto.randomUUID()}`)
  })

  describe('currentUserCanViewConversation', () => {
    it('returns false for null user', async () => {
      expect(await currentUserCanViewConversation(null, conversation)).toBe(false)
    })

    it('returns true for the owner', async () => {
      expect(await currentUserCanViewConversation(owner, conversation)).toBe(true)
    })

    it('returns false for a non-admin other user', async () => {
      expect(await currentUserCanViewConversation(otherUser, conversation)).toBe(false)
    })

    it('returns false for an administrator who does not own the conversation', async () => {
      expect(await currentUserCanViewConversation(administrator, conversation)).toBe(false)
    })
  })

  describe('currentUserCanUpdateConversation', () => {
    it('returns false for null user', async () => {
      expect(await currentUserCanUpdateConversation(null, conversation)).toBe(false)
    })

    it('returns true for the owner', async () => {
      expect(await currentUserCanUpdateConversation(owner, conversation)).toBe(true)
    })

    it('returns false for a non-admin other user', async () => {
      expect(await currentUserCanUpdateConversation(otherUser, conversation)).toBe(false)
    })

    it('returns false for an administrator who does not own the conversation', async () => {
      expect(await currentUserCanUpdateConversation(administrator, conversation)).toBe(false)
    })
  })

  describe('currentUserCanDeleteConversation', () => {
    it('returns false for null user', async () => {
      expect(await currentUserCanDeleteConversation(null, conversation)).toBe(false)
    })

    it('returns true for the owner', async () => {
      expect(await currentUserCanDeleteConversation(owner, conversation)).toBe(true)
    })

    it('returns false for a non-admin other user', async () => {
      expect(await currentUserCanDeleteConversation(otherUser, conversation)).toBe(false)
    })

    it('returns false for an administrator who does not own the conversation', async () => {
      expect(await currentUserCanDeleteConversation(administrator, conversation)).toBe(false)
    })
  })
})
