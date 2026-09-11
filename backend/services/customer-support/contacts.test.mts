import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  getOrCreateSupportContactByEmail,
  getSupportContactById,
  getSupportContactByEmail,
  updateSupportContact,
  linkSupportContactToUser,
  searchSupportContacts,
} from './contacts.mts'

describe('contacts', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('getOrCreateSupportContactByEmail', () => {
    it('creates a new contact', async () => {
      const email = `tests+test-${rand()}@voucha.ai`
      const contact = await getOrCreateSupportContactByEmail(email, 'Test User')
      expect(contact.email_address).toBe(email)
      expect(contact.name).toBe('Test User')
      expect(contact.user_id).toBeNull()
    })

    it('normalizes email to lowercase', async () => {
      const email = `tests+TEST-${rand()}@voucha.ai`
      const contact = await getOrCreateSupportContactByEmail(email)
      expect(contact.email_address).toBe(email.toLowerCase().trim())
    })

    it('rejects empty email addresses', async () => {
      await expect(getOrCreateSupportContactByEmail('   ')).rejects.toThrow(Error)
    })

    it('upserts on conflict without changing name when no name provided', async () => {
      const email = `tests+upsert-${rand()}@voucha.ai`
      const first = await getOrCreateSupportContactByEmail(email, 'First Name')
      const second = await getOrCreateSupportContactByEmail(email)
      expect(second.id).toBe(first.id)
      expect(second.name).toBe('First Name')
    })

    it('updates name on conflict when new name provided', async () => {
      const email = `tests+upsert-name-${rand()}@voucha.ai`
      await getOrCreateSupportContactByEmail(email, 'Old Name')
      const updated = await getOrCreateSupportContactByEmail(email, 'New Name')
      expect(updated.name).toBe('New Name')
    })
  })

  describe('getSupportContactById', () => {
    it('returns null for non-existent ID', async () => {
      const result = await getSupportContactById('00000000-0000-0000-0000-000000000000')
      expect(result).toBeNull()
    })

    it('returns contact by ID', async () => {
      const email = `tests+byid-${rand()}@voucha.ai`
      const created = await getOrCreateSupportContactByEmail(email)
      const found = await getSupportContactById(created.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
    })
  })

  describe('getSupportContactByEmail', () => {
    it('returns null for non-existent email', async () => {
      const result = await getSupportContactByEmail(`tests+nonexistent-${rand()}@voucha.ai`)
      expect(result).toBeNull()
    })

    it('returns contact by email (case insensitive)', async () => {
      const email = `tests+byemail-${rand()}@voucha.ai`
      await getOrCreateSupportContactByEmail(email)
      const found = await getSupportContactByEmail(email.toUpperCase())
      expect(found).not.toBeNull()
    })
  })

  describe('updateSupportContact', () => {
    it('updates name and notes', async () => {
      const email = `tests+update-${rand()}@voucha.ai`
      const contact = await getOrCreateSupportContactByEmail(email)
      const updated = await updateSupportContact(contact.id, {
        name: 'Updated Name',
        notes: 'Admin notes',
      })
      expect(updated!.name).toBe('Updated Name')
      expect(updated!.notes).toBe('Admin notes')
    })
  })

  describe('linkSupportContactToUser', () => {
    it('links contact to user', async () => {
      const email = `tests+link-${rand()}@voucha.ai`
      const contact = await getOrCreateSupportContactByEmail(email)
      await linkSupportContactToUser(contact.id, user.id)
      const found = await getSupportContactById(contact.id)
      expect(found!.user_id).toBe(user.id)
    })
  })

  describe('searchSupportContacts', () => {
    it('returns contacts matching email filter', async () => {
      const suffix = rand()
      const email = `tests+search-${suffix}@voucha.ai`
      await getOrCreateSupportContactByEmail(email, `Search User ${suffix}`)
      const { results } = await searchSupportContacts({ q: suffix })
      const contact = await getSupportContactByEmail(email)
      const ids = results.map(r => r.id)
      expect(ids).toContain(contact!.id)
    })

    it('supports cursor pagination', async () => {
      const { results, page_info } = await searchSupportContacts({ limit: 1 })
      expect(results.length).toBeLessThanOrEqual(1)
      expect(page_info).toHaveProperty('has_next_page')
      expect(page_info).toHaveProperty('end_cursor')
    })
  })
})
