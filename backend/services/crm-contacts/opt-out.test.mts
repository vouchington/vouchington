import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createTestCrmContact,
  createUniqueTestEmail,
  getTestCrmContactLifecycleChanges,
} from '@voucha/test-helpers'
import { optOutCrmContactByEmail, wasCrmContactEmailOptedOut } from './opt-out.mts'
import { getCrmContact } from './get.mts'
import type { PrivateUser } from '@services/users/types'

describe('opt-out', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('optOutCrmContactByEmail', () => {
    it('sets opted_out_at and records a mark_opted_out lifecycle row', async () => {
      const email = createUniqueTestEmail('crm-opt-out')
      const contact = await createTestCrmContact(admin, { email })
      expect(contact.opted_out_at).toBeNull()

      await optOutCrmContactByEmail(email)

      const updated = await getCrmContact(contact.id)
      expect(updated!.opted_out_at).not.toBeNull()
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
      expect(changes[0].change_type).toBe('mark_opted_out')
      expect(changes[0].changed_by_id).toBeNull()
      expect(changes[0].opted_out_at?.getTime()).toBe(updated!.opted_out_at?.getTime())
    })

    it('matches email case-insensitively', async () => {
      const email = createUniqueTestEmail('crm-opt-out-case')
      const contact = await createTestCrmContact(admin, { email })

      await optOutCrmContactByEmail(email.toUpperCase())

      const updated = await getCrmContact(contact.id)
      expect(updated!.opted_out_at).not.toBeNull()
    })

    it('is idempotent for an already opted-out contact', async () => {
      const email = createUniqueTestEmail('crm-opt-out-repeat')
      const contact = await createTestCrmContact(admin, { email })
      await optOutCrmContactByEmail(email)
      const first = await getCrmContact(contact.id)

      await optOutCrmContactByEmail(email)

      const second = await getCrmContact(contact.id)
      expect(second!.opted_out_at?.getTime()).toBe(first!.opted_out_at?.getTime())
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
    })

    it('does not throw for an email with no matching contact', async () => {
      await expect(
        optOutCrmContactByEmail(createUniqueTestEmail('crm-opt-out-unknown')),
      ).resolves.toBeUndefined()
    })
  })

  describe('wasCrmContactEmailOptedOut', () => {
    it('returns true after the email has been opted out', async () => {
      const email = createUniqueTestEmail('crm-was-opted-out')
      await createTestCrmContact(admin, { email })

      await optOutCrmContactByEmail(email)

      expect(await wasCrmContactEmailOptedOut(email)).toBe(true)
    })

    it('returns false for an email that has never been opted out', async () => {
      const email = createUniqueTestEmail('crm-was-not-opted-out')
      await createTestCrmContact(admin, { email })

      expect(await wasCrmContactEmailOptedOut(email)).toBe(false)
    })
  })
})
