import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createTestCrmContact,
  insertTestCrmThread,
  insertTestCrmMessage,
} from '@voucha/test-helpers'
import { getCrmMessagesByConversationId, getCrmMessagesByContactId } from './get.mts'
import type { PrivateUser } from '@services/users/types'

describe('get', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('getCrmMessagesByConversationId', () => {
    it('returns empty results for conversation with no messages', async () => {
      const contact = await createTestCrmContact(admin)
      const thread = await insertTestCrmThread({ contactId: contact.id, createdById: admin.id })
      const result = await getCrmMessagesByConversationId(thread.id)
      expect(result.results).toEqual([])
      expect(result.page_info.has_next_page).toBe(false)
      expect(result.page_info.end_cursor).toBeNull()
    })

    it('returns messages for a conversation in descending order', async () => {
      const contact = await createTestCrmContact(admin)
      const thread = await insertTestCrmThread({ contactId: contact.id, createdById: admin.id })
      const msg1 = await insertTestCrmMessage({ threadId: thread.id, sentById: admin.id })
      const msg2 = await insertTestCrmMessage({ threadId: thread.id, sentById: admin.id })
      const msg3 = await insertTestCrmMessage({ threadId: thread.id, sentById: admin.id })
      const result = await getCrmMessagesByConversationId(thread.id)
      const ids = result.results.map(m => m.id)
      expect(ids).toContain(msg1.id)
      expect(ids).toContain(msg2.id)
      expect(ids).toContain(msg3.id)
      // Ordered by id DESC (newest first)
      expect(ids.indexOf(msg3.id)).toBeLessThan(ids.indexOf(msg1.id))
    })

    it('returns messages with correct entity type', async () => {
      const contact = await createTestCrmContact(admin)
      const thread = await insertTestCrmThread({ contactId: contact.id, createdById: admin.id })
      await insertTestCrmMessage({ threadId: thread.id, sentById: admin.id })
      const result = await getCrmMessagesByConversationId(thread.id)
      expect(result.results[0].__entity_type).toBe('crm_message')
      expect(result.results[0].conversation_id).toBe(thread.id)
    })

    it('reuses the contact conversation in the test helper', async () => {
      const contact = await createTestCrmContact(admin)
      const first = await insertTestCrmThread({ contactId: contact.id, createdById: admin.id })
      const second = await insertTestCrmThread({ contactId: contact.id, createdById: admin.id })
      expect(second.id).toBe(first.id)
    })

    it('paginates messages', async () => {
      const contact = await createTestCrmContact(admin)
      const thread = await insertTestCrmThread({ contactId: contact.id, createdById: admin.id })
      await Promise.all([
        insertTestCrmMessage({ threadId: thread.id, sentById: admin.id }),
        insertTestCrmMessage({ threadId: thread.id, sentById: admin.id }),
        insertTestCrmMessage({ threadId: thread.id, sentById: admin.id }),
      ])
      const page1 = await getCrmMessagesByConversationId(thread.id, { limit: 2 })
      expect(page1.results).toHaveLength(2)
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).toBeTruthy()

      const page2 = await getCrmMessagesByConversationId(thread.id, {
        limit: 2,
        after: page1.page_info.end_cursor!,
      })
      expect(page2.results.length).toBeGreaterThanOrEqual(1)
      const page1Ids = new Set(page1.results.map(m => m.id))
      expect(page2.results.every(m => !page1Ids.has(m.id))).toBe(true)
    })
  })

  describe('getCrmMessagesByContactId', () => {
    it('returns messages for a contact conversation', async () => {
      const contact = await createTestCrmContact(admin)
      const thread = await insertTestCrmThread({ contactId: contact.id, createdById: admin.id })
      const [msg1, msg2] = await Promise.all([
        insertTestCrmMessage({ threadId: thread.id, sentById: admin.id }),
        insertTestCrmMessage({ threadId: thread.id, sentById: admin.id }),
      ])
      const result = await getCrmMessagesByContactId(contact.id)
      const ids = result.results.map(m => m.id)
      expect(ids).toContain(msg1.id)
      expect(ids).toContain(msg2.id)
    })

    it('does not return messages from other contacts', async () => {
      const contact1 = await createTestCrmContact(admin)
      const contact2 = await createTestCrmContact(admin)
      const thread1 = await insertTestCrmThread({ contactId: contact1.id, createdById: admin.id })
      const thread2 = await insertTestCrmThread({ contactId: contact2.id, createdById: admin.id })
      const msg1 = await insertTestCrmMessage({ threadId: thread1.id, sentById: admin.id })
      await insertTestCrmMessage({ threadId: thread2.id, sentById: admin.id })

      const result = await getCrmMessagesByContactId(contact1.id)
      const ids = result.results.map(m => m.id)
      expect(ids).toContain(msg1.id)
      // Should not contain messages from contact2's conversation
      result.results.forEach(m => {
        expect(m.conversation_id).not.toBe(thread2.id)
      })
    })

    it('returns empty results for contact with no messages', async () => {
      const contact = await createTestCrmContact(admin)
      const result = await getCrmMessagesByContactId(contact.id)
      expect(result.results).toEqual([])
      expect(result.page_info.has_next_page).toBe(false)
    })
  })
})
