import { describe, it, expect, beforeAll } from 'vitest'
import { insertTestSupportContact } from '@voucha/test-helpers/entities/support-contacts'
import { insertTestSupportThread } from '@voucha/test-helpers/entities/support-threads'
import { insertTestSupportMessage } from '@voucha/test-helpers/entities/support-messages'
import { searchSupportMessagesForRag } from './search-messages.mts'

describe('search-messages', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let threadId: string
  let uniqueWord: string

  beforeAll(async () => {
    uniqueWord = `xqzragsearch${rand()}`
    const contact = await insertTestSupportContact({
      emailAddress: `tests+rag-search-${rand()}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    threadId = thread.id
    await insertTestSupportMessage({
      supportThreadId: threadId,
      bodyText: `This message contains the unique word ${uniqueWord} for testing.`,
    })
  })

  describe('searchSupportMessagesForRag', () => {
    it('returns results containing the unique word', async () => {
      const results = await searchSupportMessagesForRag(uniqueWord, { limit: 5 })
      const ids = results.map(r => r.thread_id)
      expect(ids).toContain(threadId)
    })

    it('returns RAG result shape with required fields', async () => {
      const results = await searchSupportMessagesForRag(uniqueWord, { limit: 1 })
      expect(results.length).toBeGreaterThanOrEqual(1)
      const result = results[0]
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('thread_id')
      expect(result).toHaveProperty('thread_subject')
      expect(result).toHaveProperty('contact_name')
      expect(result).toHaveProperty('contact_email')
      expect(result).toHaveProperty('direction')
      expect(result).toHaveProperty('body_text')
      expect(result).toHaveProperty('created_at')
    })

    it('respects the limit option', async () => {
      const results = await searchSupportMessagesForRag(uniqueWord, { limit: 1 })
      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('caps limit at 10', async () => {
      const results = await searchSupportMessagesForRag(uniqueWord, { limit: 100 })
      expect(results.length).toBeLessThanOrEqual(10)
    })

    it('returns empty array for unmatched query', async () => {
      const results = await searchSupportMessagesForRag(`zzznomatch${rand()}`, { limit: 5 })
      expect(results).toEqual([])
    })
  })
})
