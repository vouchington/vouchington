import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
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
  let unlinkedConversation: Conversation
  let supportLinkedConversation: Conversation

  beforeAll(async () => {
    administrator = await createTestUser({ administrator: true })
    owner = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)

    unlinkedConversation = await createConversation(owner.id, `Unlinked conversation ${suffix}`)
    supportLinkedConversation = await createConversation(
      owner.id,
      `Support linked conversation ${suffix}`,
    )
    const contact = await insertTestSupportContact({
      emailAddress: `conversation-authorization-${suffix}@example.test`,
      userId: owner.id,
    })
    await insertTestSupportThread({
      supportContactId: contact.id,
      conversationId: supportLinkedConversation.id,
    })
  })

  it('restricts administrator update and delete access to support-linked conversations', async () => {
    await expect(
      currentUserCanUpdateConversation(administrator, unlinkedConversation),
    ).resolves.toBe(false)
    await expect(
      currentUserCanDeleteConversation(administrator, unlinkedConversation),
    ).resolves.toBe(false)
    await expect(
      currentUserCanUpdateConversation(administrator, supportLinkedConversation),
    ).resolves.toBe(true)
    await expect(
      currentUserCanDeleteConversation(administrator, supportLinkedConversation),
    ).resolves.toBe(true)
  })

  it('restricts administrator view access to support-linked conversations', async () => {
    await expect(currentUserCanViewConversation(administrator, unlinkedConversation)).resolves.toBe(
      false,
    )
    await expect(
      currentUserCanViewConversation(administrator, supportLinkedConversation),
    ).resolves.toBe(true)
  })
})
