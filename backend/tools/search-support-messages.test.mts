import { beforeAll, describe, expect, it } from 'vitest'
import searchSupportMessagesTool from './search-support-messages.mts'
import { insertTestSupportContact } from '@voucha/test-helpers/entities/support-contacts'
import { insertTestSupportThread } from '@voucha/test-helpers/entities/support-threads'
import { insertTestSupportMessage } from '@voucha/test-helpers/entities/support-messages'

describe('search-support-messages', () => {
  let query: string

  describe('search_support_messages tool', () => {
    beforeAll(async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      query = `supportrag${suffix}`
      const contact = await insertTestSupportContact({
        emailAddress: `tests+${query}@voucha.ai`,
        name: `Support User ${suffix}`,
      })
      const thread = await insertTestSupportThread({
        supportContactId: contact.id,
        subject: `Support Thread ${suffix}`,
      })
      for (const index of Array.from({ length: 12 }, (_, value) => value)) {
        await insertTestSupportMessage({
          supportThreadId: thread.id,
          bodyText: `Message ${index} mentions ${query} and <script>bad()</script>`,
        })
      }
    })

    it('has correct schema name', () => {
      expect(searchSupportMessagesTool.schema.name).toBe('search_support_messages')
    })

    it('schema has query and limit properties', () => {
      const params = searchSupportMessagesTool.schema.parameters as Record<string, unknown>
      const props = params.properties as Record<string, unknown>
      expect(props).toHaveProperty('query')
      expect(props).toHaveProperty('limit')
    })

    it('query is required', () => {
      const params = searchSupportMessagesTool.schema.parameters as Record<string, unknown>
      const required = params.required as string[]
      expect(required).toContain('query')
    })

    it('allows administrators and the customer support role', () => {
      expect(searchSupportMessagesTool.roles?.administrator).toBe(true)
      expect(searchSupportMessagesTool.roles?.customer_support).toBe(true)
      expect(searchSupportMessagesTool.roles?.user).toBe(false)
    })

    it('returns sanitized wrapped results from real searchSupportMessagesForRag', async () => {
      const execute = searchSupportMessagesTool.function(null as never)
      const result = await execute({ query, limit: 1 })

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].body_text).toContain('<external-content')
      expect(result.results[0].body_text).not.toContain('<script>')
    })

    it('uses default limit of 5 when not provided', async () => {
      const execute = searchSupportMessagesTool.function(null as never)
      const result = await execute({ query })

      expect(result.results).toHaveLength(5)
    })

    it('clamps limit to max of 10', async () => {
      const execute = searchSupportMessagesTool.function(null as never)
      const result = await execute({ query, limit: 100 })

      expect(result.results).toHaveLength(10)
    })
  })
})
