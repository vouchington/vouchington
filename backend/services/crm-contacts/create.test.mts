import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCrmContact } from './create.mts'
import { getCrmContactSocialAccounts } from './get.mts'
import { optOutCrmContactByEmail } from './opt-out.mts'
import { archiveCrmContact } from './delete.mts'
import type { PrivateUser } from '@services/users/types'

describe('create', () => {
  const r = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('createCrmContact', () => {
    it('creates a contact with required fields', async () => {
      const suffix = r()
      const contact = await createCrmContact(admin, {
        name: `Jane Doe ${suffix}`,
        email: `tests+jane-${suffix}@voucha.ai`,
      })
      expect(contact.id).toBeTruthy()
      expect(contact.name).toBe(`Jane Doe ${suffix}`)
      expect(contact.email).toBe(`tests+jane-${suffix}@voucha.ai`)
      expect(contact.contact_type).toBe('influencer')
      expect(contact.source).toBe('manual')
      expect(contact.created_by_id).toBe(admin.id)
      expect(contact.__entity_type).toBe('crm_contact')
    })

    it('normalizes email to lowercase', async () => {
      const suffix = r()
      const contact = await createCrmContact(admin, {
        name: `Upper Email ${suffix}`,
        email: `tests+UPPER-${suffix}@voucha.ai`,
      })
      expect(contact.email).toBe(`tests+upper-${suffix}@voucha.ai`)
    })

    it('creates a contact with all optional fields', async () => {
      const suffix = r()
      const contact = await createCrmContact(admin, {
        name: `Full Contact ${suffix}`,
        email: `tests+full-${suffix}@voucha.ai`,
        phone: '+1234567890',
        vertical: 'travel',
        contact_type: 'partner',
        source: 'csv_import',
        follower_count: 10000,
        notes: 'Test notes',
        metadata: { key: 'value' },
      })
      expect(contact.phone).toBe('+1234567890')
      expect(contact.vertical).toBe('travel')
      expect(contact.contact_type).toBe('partner')
      expect(contact.source).toBe('csv_import')
      expect(contact.follower_count).toBe(10000)
      expect(contact.notes).toBe('Test notes')
      expect(contact.metadata).toEqual({ key: 'value' })
    })

    it('creates a contact with social accounts', async () => {
      const suffix = r()
      const contact = await createCrmContact(admin, {
        name: `Social Contact ${suffix}`,
        email: `tests+social-${suffix}@voucha.ai`,
        social_accounts: [
          { platform: 'instagram', handle: `@influencer_${suffix}`, follower_count: 50000 },
          { platform: 'tiktok', handle: `@tiktok_${suffix}` },
        ],
      })
      expect(contact.id).toBeTruthy()
      const accounts = await getCrmContactSocialAccounts(contact.id)
      expect(accounts).toHaveLength(2)
      expect(accounts.some(a => a.platform === 'instagram')).toBe(true)
      expect(accounts.some(a => a.platform === 'tiktok')).toBe(true)
    })

    it('upserts social account on duplicate platform', async () => {
      const suffix = r()
      await createCrmContact(admin, {
        name: `Upsert Social ${suffix}`,
        email: `tests+upsert-social-${suffix}@voucha.ai`,
        social_accounts: [{ platform: 'instagram', handle: `@handle1_${suffix}` }],
      })
      // Create with same email but updated handle (different contact — same platform upsert)
      const contact2 = await createCrmContact(admin, {
        name: `Upsert Social 2 ${suffix}`,
        email: `tests+upsert-social-2-${suffix}@voucha.ai`,
        social_accounts: [
          { platform: 'instagram', handle: `@handle_a_${suffix}` },
          { platform: 'instagram', handle: `@handle_b_${suffix}` },
        ],
      })
      const accounts = await getCrmContactSocialAccounts(contact2.id)
      // Last upsert wins — only one instagram account
      const instagramAccounts = accounts.filter(a => a.platform === 'instagram')
      expect(instagramAccounts).toHaveLength(1)
      expect(instagramAccounts[0].handle).toBe(`@handle_b_${suffix}`)
    })

    it('throws 403 for non-admin users', async () => {
      const suffix = r()
      await expect(
        createCrmContact(regularUser, {
          name: `Blocked ${suffix}`,
          email: `tests+blocked-${suffix}@voucha.ai`,
        }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 when name is missing', async () => {
      await expect(
        createCrmContact(admin, { name: '', email: `tests+test-${r()}@voucha.ai` }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 when email is missing', async () => {
      await expect(createCrmContact(admin, { name: `Name ${r()}`, email: '' })).rejects.toThrow(
        Error,
      )
    })

    it('throws 422 for negative follower_count', async () => {
      const suffix = r()
      await expect(
        createCrmContact(admin, {
          name: `Name ${suffix}`,
          email: `tests+test-${suffix}@voucha.ai`,
          follower_count: -1,
        }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 for non-integer follower_count', async () => {
      const suffix = r()
      await expect(
        createCrmContact(admin, {
          name: `Name ${suffix}`,
          email: `tests+test-${suffix}@voucha.ai`,
          follower_count: 1.5,
        }),
      ).rejects.toThrow(Error)
    })

    it('carries opt-out forward when re-creating a contact for an archived, opted-out email', async () => {
      const suffix = r()
      const email = `tests+opted-out-archived-${suffix}@voucha.ai`

      const contact = await createCrmContact(admin, { name: `Opted Out ${suffix}`, email })
      await optOutCrmContactByEmail(email)
      await archiveCrmContact(admin, contact.id)

      // Archived contacts don't collide on email uniqueness, so this creates a fresh row.
      const recreated = await createCrmContact(admin, {
        name: `Opted Out ${suffix} Recreated`,
        email,
      })

      expect(recreated.id).not.toBe(contact.id)
      expect(recreated.opted_out_at).not.toBeNull()
    })
  })
})
