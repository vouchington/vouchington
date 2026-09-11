import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import { searchCrmContacts } from './search.mts'
import { linkCrmContactToUser } from './link-user.mts'
import type { PrivateUser } from '@services/users/types'

describe('search', () => {
  let admin: PrivateUser
  let linkedUser: PrivateUser

  beforeAll(async () => {
    ;[admin, linkedUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('searchCrmContacts', () => {
    it('returns contacts with page_info', async () => {
      await createTestCrmContact(admin)

      const result = await searchCrmContacts({ limit: 10 })

      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('page_info')
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.page_info).toHaveProperty('has_next_page')
      expect(result.page_info).toHaveProperty('end_cursor')
    })

    it('filters by text search query', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const contact = await createTestCrmContact(admin, {
        name: `UniqueSearchName-${suffix}`,
        email: `unique-search-${suffix}@test.com`,
      })

      const result = await searchCrmContacts({ q: suffix })

      const ids = result.results.map(c => c.id)
      expect(ids).toContain(contact.id)
    })

    it('filters by vertical', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const contact = await createTestCrmContact(admin, {
        name: `TravelContact-${suffix}`,
        email: `travel-${suffix}@test.com`,
        vertical: 'travel',
      })

      const result = await searchCrmContacts({ vertical: 'travel', q: suffix })

      const ids = result.results.map(c => c.id)
      expect(ids).toContain(contact.id)
    })

    it('filters linked contacts (linked=true)', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const contact = await createTestCrmContact(admin, {
        name: `LinkedContact-${suffix}`,
        email: `linked-${suffix}@test.com`,
      })
      await linkCrmContactToUser(admin, contact.id, linkedUser.id)

      const result = await searchCrmContacts({ linked: true, q: suffix })

      const ids = result.results.map(c => c.id)
      expect(ids).toContain(contact.id)
    })

    it('filters unlinked contacts (linked=false)', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const contact = await createTestCrmContact(admin, {
        name: `UnlinkedContact-${suffix}`,
        email: `unlinked-${suffix}@test.com`,
      })

      const result = await searchCrmContacts({ linked: false, q: suffix })

      const ids = result.results.map(c => c.id)
      expect(ids).toContain(contact.id)
    })

    it('paginates results using name cursor', async () => {
      // Create multiple contacts with similar names to force pagination
      const suffix = Math.random().toString(36).slice(2, 10)
      await Promise.all([
        createTestCrmContact(admin, {
          name: `PaginationA-${suffix}`,
          email: `page-a-${suffix}@test.com`,
        }),
        createTestCrmContact(admin, {
          name: `PaginationB-${suffix}`,
          email: `page-b-${suffix}@test.com`,
        }),
        createTestCrmContact(admin, {
          name: `PaginationC-${suffix}`,
          email: `page-c-${suffix}@test.com`,
        }),
      ])

      const page1 = await searchCrmContacts({ limit: 2, q: suffix })
      expect(page1.results.length).toBe(2)
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).toBeTruthy()

      const page2 = await searchCrmContacts({
        limit: 2,
        q: suffix,
        after: page1.page_info.end_cursor!,
      })
      expect(page2.results.length).toBeGreaterThanOrEqual(1)
    })
  })
})
