import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getCrmContact, getCrmContactByEmail, getCrmContactSocialAccounts } from './get.mts'
import { createCrmContact } from './create.mts'
import { archiveCrmContact } from './delete.mts'
import type { PrivateUser } from '@services/users/types'

describe('get', () => {
  const r = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('getCrmContact', () => {
    it('returns null for non-existent contact', async () => {
      const result = await getCrmContact('00000000-0000-0000-0000-000000000001')
      expect(result).toBeNull()
    })

    it('returns the contact for a valid ID', async () => {
      const suffix = r()
      const created = await createCrmContact(admin, {
        name: `Get Test ${suffix}`,
        email: `tests+get-test-${suffix}@voucha.ai`,
      })
      const result = await getCrmContact(created.id)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(created.id)
      expect(result!.name).toBe(created.name)
      expect(result!.email).toBe(created.email)
      expect(result!.__entity_type).toBe('crm_contact')
    })

    it('returns all expected fields', async () => {
      const suffix = r()
      const created = await createCrmContact(admin, {
        name: `Fields Test ${suffix}`,
        email: `tests+fields-${suffix}@voucha.ai`,
        vertical: 'ai',
        follower_count: 5000,
        notes: 'Some notes',
      })
      const result = await getCrmContact(created.id)
      expect(result).not.toBeNull()
      expect(result!.vertical).toBe('ai')
      expect(result!.follower_count).toBe(5000)
      expect(result!.notes).toBe('Some notes')
      expect(result!.contacted_at).toBeNull()
      expect(result!.archived_at).toBeNull()
    })
  })

  describe('getCrmContactByEmail', () => {
    it('returns null for non-existent email', async () => {
      const result = await getCrmContactByEmail(`tests+nonexistent-${r()}@voucha.ai`)
      expect(result).toBeNull()
    })

    it('returns contact by email', async () => {
      const suffix = r()
      const email = `tests+lookup-${suffix}@voucha.ai`
      await createCrmContact(admin, { name: `Lookup ${suffix}`, email })
      const result = await getCrmContactByEmail(email)
      expect(result).not.toBeNull()
      expect(result!.email).toBe(email)
    })

    it('normalizes email for lookup', async () => {
      const suffix = r()
      const email = `tests+case-${suffix}@voucha.ai`
      await createCrmContact(admin, { name: `Case ${suffix}`, email })
      const result = await getCrmContactByEmail(`tests+CASE-${suffix}@voucha.ai`)
      expect(result).not.toBeNull()
      expect(result!.email).toBe(email)
    })

    it('returns null for archived contact', async () => {
      const suffix = r()
      const email = `tests+archived-lookup-${suffix}@voucha.ai`
      const contact = await createCrmContact(admin, { name: `Archived ${suffix}`, email })
      await archiveCrmContact(admin, contact.id)
      const result = await getCrmContactByEmail(email)
      expect(result).toBeNull()
    })
  })

  describe('getCrmContactSocialAccounts', () => {
    it('returns empty array for contact with no social accounts', async () => {
      const suffix = r()
      const contact = await createCrmContact(admin, {
        name: `No Socials ${suffix}`,
        email: `tests+no-socials-${suffix}@voucha.ai`,
      })
      const accounts = await getCrmContactSocialAccounts(contact.id)
      expect(accounts).toEqual([])
    })

    it('returns social accounts ordered by platform', async () => {
      const suffix = r()
      const contact = await createCrmContact(admin, {
        name: `Multi Social ${suffix}`,
        email: `tests+multi-social-${suffix}@voucha.ai`,
        social_accounts: [
          { platform: 'tiktok', handle: `@tt_${suffix}` },
          { platform: 'instagram', handle: `@ig_${suffix}` },
          { platform: 'youtube', handle: `@yt_${suffix}` },
        ],
      })
      const accounts = await getCrmContactSocialAccounts(contact.id)
      expect(accounts).toHaveLength(3)
      // Ordered by platform alphabetically
      expect(accounts[0].platform).toBe('instagram')
      expect(accounts[1].platform).toBe('tiktok')
      expect(accounts[2].platform).toBe('youtube')
    })

    it('returns entity type on each account', async () => {
      const suffix = r()
      const contact = await createCrmContact(admin, {
        name: `Entity Type ${suffix}`,
        email: `tests+entity-type-${suffix}@voucha.ai`,
        social_accounts: [{ platform: 'linkedin', handle: `@li_${suffix}` }],
      })
      const accounts = await getCrmContactSocialAccounts(contact.id)
      expect(accounts[0].__entity_type).toBe('crm_contact_social_account')
      expect(accounts[0].contact_id).toBe(contact.id)
    })
  })
})
