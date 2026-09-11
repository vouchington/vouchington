import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import { getCrmContactSocialAccounts } from './get.mts'
import { upsertCrmContactSocialAccounts } from './social-accounts.mts'
import type { PrivateUser } from '@services/users/types'

describe('social-accounts', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('upsertCrmContactSocialAccounts', () => {
    it('does nothing when given no social accounts', async () => {
      const contact = await createTestCrmContact(admin)

      await upsertCrmContactSocialAccounts(admin, contact.id, [])

      await expect(getCrmContactSocialAccounts(contact.id)).resolves.toEqual([])
    })

    it('throws 403 for non-admin users', async () => {
      const contact = await createTestCrmContact(admin)

      await expect(
        upsertCrmContactSocialAccounts(regularUser, contact.id, [
          { platform: 'instagram', handle: 'regular-user' },
        ]),
      ).rejects.toThrow(Error)
    })

    it('upserts multiple platforms in one call', async () => {
      const contact = await createTestCrmContact(admin)

      await upsertCrmContactSocialAccounts(admin, contact.id, [
        { platform: 'youtube', handle: '\t\u00a0youtube_handle\u00a0\n' },
        { platform: 'instagram', handle: 'instagram_handle' },
      ])

      const accounts = await getCrmContactSocialAccounts(contact.id)
      expect(accounts).toMatchObject([
        { platform: 'instagram', handle: 'instagram_handle' },
        { platform: 'youtube', handle: 'youtube_handle' },
      ])
    })

    it('keeps the last handle when duplicate platforms are upserted', async () => {
      const contact = await createTestCrmContact(admin)

      await upsertCrmContactSocialAccounts(admin, contact.id, [
        { platform: 'instagram', handle: 'old_instagram' },
        { platform: 'tiktok', handle: 'tiktok_handle' },
      ])

      await upsertCrmContactSocialAccounts(admin, contact.id, [
        { platform: 'instagram', handle: 'ignored_instagram' },
        { platform: 'instagram', handle: 'kept_instagram' },
        { platform: 'tiktok', handle: 'updated_tiktok' },
      ])

      const accounts = await getCrmContactSocialAccounts(contact.id)
      expect(accounts).toMatchObject([
        { platform: 'instagram', handle: 'kept_instagram' },
        { platform: 'tiktok', handle: 'updated_tiktok' },
      ])
    })
  })
})
