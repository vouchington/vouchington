import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestConversation,
  createTestUser,
  getTestSupportThreadLifecycleChanges,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  createSupportThread,
  getSupportThreadById,
  getSupportThreadsByContactId,
  searchSupportThreads,
  assignSupportThread,
  resolveSupportThread,
  reopenSupportThread,
} from './threads.mts'
import { createSupportThreadWithInitialMessage } from './create-support-thread-with-initial-message.mts'
import { getSupportMessagesByThreadId } from './get-support-messages-by-thread-id.mts'
import { isConversationLinkedToSupportThread } from './conversation-consent.mts'
import { getOrCreateSupportContactByEmail } from './contacts.mts'
import { getSupportAgentJobsFor, getSupportMessageEmbeddingJobsFor } from './queue-test-helpers.mts'

describe('threads', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let user: PrivateUser
  let assignee: PrivateUser
  let contactId: string

  beforeAll(async () => {
    ;[user, assignee] = await Promise.all([createTestUser(), createTestUser()])
    const contact = await getOrCreateSupportContactByEmail(`tests+threads-test-${rand()}@voucha.ai`)
    contactId = contact.id
  })

  describe('createSupportThread', () => {
    it('creates a support thread with open status', async () => {
      const subject = `Test thread ${rand()}`
      const thread = await createSupportThread(contactId, subject)
      expect(thread.id).toBeDefined()
      expect(thread.subject).toBe(subject)
      expect(thread.support_contact_id).toBe(contactId)
      expect(thread.assigned_at).toBeNull()
      expect(thread.resolved_at).toBeNull()
      expect(thread.status).toBe('open')
    })
  })

  describe('createSupportThreadWithInitialMessage', () => {
    it('creates a thread and initial inbound message in one transaction', async () => {
      const suffix = rand()
      const thread = await createSupportThreadWithInitialMessage(
        contactId,
        `Thread with message ${suffix}`,
        {
          message: `  Initial message ${suffix}  `,
          agentModelName: 'gpt-5.4-nano',
          agentModelProvider: 'openai',
        },
      )

      expect(thread.thread.subject).toBe(`Thread with message ${suffix}`)
      expect(thread.thread.status).toBe('open')
      expect(thread.message?.body_text).toBe(`Initial message ${suffix}`)

      const { results: messages } = await getSupportMessagesByThreadId(thread.thread.id)
      expect(messages).toHaveLength(1)
      expect(messages[0].body_text).toBe(`Initial message ${suffix}`)

      await expect.poll(async () => (await getSupportAgentJobsFor(thread.thread.id)).length).toBe(1)

      expect(thread.message).toBeDefined()
      await expect
        .poll(
          async () =>
            (await getSupportMessageEmbeddingJobsFor(thread.thread.id, thread.message!.id)).length,
        )
        .toBe(1)
    })
  })

  describe('getSupportThreadById', () => {
    it('returns null for non-existent ID', async () => {
      const result = await getSupportThreadById('00000000-0000-0000-0000-000000000000')
      expect(result).toBeNull()
    })

    it('returns thread with status=open', async () => {
      const thread = await createSupportThread(contactId, `Open thread ${rand()}`)
      const found = await getSupportThreadById(thread.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(thread.id)
      expect(found!.status).toBe('open')
    })
  })

  describe('getSupportThreadsByContactId', () => {
    it('returns threads for a contact', async () => {
      const localContact = await getOrCreateSupportContactByEmail(
        `tests+threads-by-contact-${rand()}@voucha.ai`,
      )
      const thread = await createSupportThread(localContact.id, `Thread ${rand()}`)
      const { results, page_info } = await getSupportThreadsByContactId(localContact.id)
      const ids = results.map(r => r.id)
      expect(ids).toContain(thread.id)
      expect(page_info).toHaveProperty('has_next_page')
    })

    it('supports cursor pagination', async () => {
      const { results, page_info } = await getSupportThreadsByContactId(contactId, { limit: 1 })
      expect(results.length).toBeLessThanOrEqual(1)
      expect(page_info).toHaveProperty('has_next_page')
      expect(page_info).toHaveProperty('end_cursor')
    })
  })

  describe('searchSupportThreads', () => {
    it('returns open threads when status=open filter applied', async () => {
      const localContact = await getOrCreateSupportContactByEmail(
        `tests+search-threads-${rand()}@voucha.ai`,
      )
      const thread = await createSupportThread(localContact.id, `Open search thread ${rand()}`)
      const { results } = await searchSupportThreads({ status: 'open' })
      const ids = results.map(r => r.id)
      expect(ids).toContain(thread.id)
    })

    it('filters by text search on subject', async () => {
      const uniqueWord = `xqzthread${rand()}`
      const localContact = await getOrCreateSupportContactByEmail(
        `tests+search-threads-txt-${rand()}@voucha.ai`,
      )
      const thread = await createSupportThread(localContact.id, `Thread about ${uniqueWord}`)
      const { results } = await searchSupportThreads({ q: uniqueWord })
      const ids = results.map(r => r.id)
      expect(ids).toContain(thread.id)
    })

    it('filters by text search on contact email', async () => {
      const uniqueWord = `xqzemail${rand()}`
      const localContact = await getOrCreateSupportContactByEmail(`tests+${uniqueWord}@voucha.ai`)
      const thread = await createSupportThread(localContact.id, `Email search thread ${rand()}`)
      const { results } = await searchSupportThreads({ q: uniqueWord })
      const ids = results.map(r => r.id)
      expect(ids).toContain(thread.id)
    })

    it('supports cursor pagination', async () => {
      const { results, page_info } = await searchSupportThreads({ limit: 1 })
      expect(results.length).toBeLessThanOrEqual(1)
      expect(page_info).toHaveProperty('has_next_page')
      expect(page_info).toHaveProperty('end_cursor')
    })
  })

  describe('assignSupportThread', () => {
    it('changes status to assigned', async () => {
      const thread = await createSupportThread(contactId, `Assign thread ${rand()}`)
      await assignSupportThread(thread.id, assignee.id, user.id)
      const found = await getSupportThreadById(thread.id)
      expect(found!.status).toBe('assigned')
      expect(found!.assigned_to_id).toBe(assignee.id)
      expect(found!.assigned_at).not.toBeNull()
      const changes = await getTestSupportThreadLifecycleChanges(thread.id)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        change_type: 'assign',
        changed_by_id: user.id,
        assigned_to_id: assignee.id,
      })
      expect(changes[0].assigned_at?.getTime()).toBe(found!.assigned_at?.getTime())
    })

    it('rejects assigning a resolved thread without a lifecycle change', async () => {
      const thread = await createSupportThread(contactId, `Assign resolved thread ${rand()}`)
      await resolveSupportThread(thread.id, user.id)

      await expect(assignSupportThread(thread.id, assignee.id, user.id)).rejects.toMatchObject({
        status: 409,
        message: 'Reopen this thread before assigning it',
      })

      const found = await getSupportThreadById(thread.id)
      expect(found).toMatchObject({ status: 'resolved', assigned_to_id: null })
      const changes = await getTestSupportThreadLifecycleChanges(thread.id)
      expect(changes.map(change => change.change_type)).toEqual(['resolve'])
    })
  })

  describe('resolveSupportThread', () => {
    it('changes status to resolved', async () => {
      const thread = await createSupportThread(contactId, `Resolve thread ${rand()}`)
      await resolveSupportThread(thread.id, user.id)
      const found = await getSupportThreadById(thread.id)
      expect(found!.status).toBe('resolved')
      expect(found!.resolved_by_id).toBe(user.id)
      expect(found!.resolved_at).not.toBeNull()
      const changes = await getTestSupportThreadLifecycleChanges(thread.id)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        change_type: 'resolve',
        changed_by_id: user.id,
        resolved_by_id: user.id,
      })
      expect(changes[0].resolved_at?.getTime()).toBe(found!.resolved_at?.getTime())
    })
  })

  describe('reopenSupportThread', () => {
    it('reopens a resolved thread back to open', async () => {
      const thread = await createSupportThread(contactId, `Reopen thread ${rand()}`)
      await resolveSupportThread(thread.id, user.id)
      await reopenSupportThread(thread.id, user.id)
      const found = await getSupportThreadById(thread.id)
      expect(found!.status).toBe('open')
      expect(found!.resolved_at).toBeNull()
      expect(found!.resolved_by_id).toBeNull()
      const changes = await getTestSupportThreadLifecycleChanges(thread.id)
      expect(changes.map(change => change.change_type)).toEqual(['resolve', 'reopen'])
      expect(changes[1].changed_by_id).toBe(user.id)
      expect(changes[1].resolved_at).toBeNull()
      expect(changes[1].resolved_by_id).toBeNull()
    })

    it('does not record reopen events for already-open threads', async () => {
      const thread = await createSupportThread(contactId, `No-op reopen thread ${rand()}`)
      await reopenSupportThread(thread.id, user.id)
      const found = await getSupportThreadById(thread.id)
      expect(found!.status).toBe('open')
      const changes = await getTestSupportThreadLifecycleChanges(thread.id)
      expect(changes).toHaveLength(0)
    })
  })

  describe('isConversationLinkedToSupportThread', () => {
    it('returns false for a nonexistent conversation id', async () => {
      const result = await isConversationLinkedToSupportThread(
        '00000000-0000-0000-0000-000000000000',
        user.id,
      )
      expect(result).toBe(false)
    })

    it('returns false for a conversation with no linked support thread', async () => {
      const conv = await createTestConversation({
        createdById: user.id,
        title: `Unlinked conv ${rand()}`,
      })
      const result = await isConversationLinkedToSupportThread(conv.id, user.id)
      expect(result).toBe(false)
    })

    it('returns true after a support thread is linked to the conversation via owner contact', async () => {
      const conv = await createTestConversation({
        createdById: user.id,
        title: `Linked conv ${rand()}`,
      })
      const ownerContact = await insertTestSupportContact({
        emailAddress: `tests+consent-test-${rand()}@voucha.ai`,
        userId: user.id,
      })
      await insertTestSupportThread({
        supportContactId: ownerContact.id,
        conversationId: conv.id,
      })
      const result = await isConversationLinkedToSupportThread(conv.id, user.id)
      expect(result).toBe(true)
    })

    it('returns false when thread is linked via a contact that does not belong to the conversation owner', async () => {
      const conv = await createTestConversation({
        createdById: user.id,
        title: `Non-owner linked conv ${rand()}`,
      })
      // Contact with no user_id (not linked to the conversation owner)
      const unrelatedContact = await getOrCreateSupportContactByEmail(
        `tests+unrelated-${rand()}@voucha.ai`,
      )
      await insertTestSupportThread({
        supportContactId: unrelatedContact.id,
        conversationId: conv.id,
      })
      const result = await isConversationLinkedToSupportThread(conv.id, user.id)
      expect(result).toBe(false)
    })
  })
})
