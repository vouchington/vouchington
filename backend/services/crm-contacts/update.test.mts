import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createTestCrmContact,
  getTestCrmContactLifecycleChanges,
} from '@voucha/test-helpers'
import { updateCrmContact, markCrmContactContacted } from './update.mts'
import { getCrmContact } from './get.mts'
import { optOutCrmContactByEmail } from './opt-out.mts'
import { archiveCrmContact } from './delete.mts'
import type { PrivateUser } from '@services/users/types'

describe('update', () => {
  const r = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('updateCrmContact', () => {
    it('updates contact name', async () => {
      const suffix = r()
      const contact = await createTestCrmContact(admin)
      const updated = await updateCrmContact(admin, contact.id, { name: `Updated Name ${suffix}` })
      expect(updated.name).toBe(`Updated Name ${suffix}`)
      expect(updated.name).not.toBe(contact.name)
    })

    it('updates contact email to lowercase', async () => {
      const suffix = r()
      const contact = await createTestCrmContact(admin)
      const updated = await updateCrmContact(admin, contact.id, {
        email: `tests+NEW-${suffix}@voucha.ai`,
      })
      expect(updated.email).toBe(`tests+new-${suffix}@voucha.ai`)
    })

    it('updates vertical', async () => {
      const contact = await createTestCrmContact(admin)
      const updated = await updateCrmContact(admin, contact.id, { vertical: 'travel' })
      expect(updated.vertical).toBe('travel')
    })

    it('clears vertical with null', async () => {
      const contact = await createTestCrmContact(admin, { vertical: 'travel' })
      const updated = await updateCrmContact(admin, contact.id, { vertical: null })
      expect(updated.vertical).toBeNull()
    })

    it('updates follower_count', async () => {
      const contact = await createTestCrmContact(admin)
      const updated = await updateCrmContact(admin, contact.id, { follower_count: 99999 })
      expect(updated.follower_count).toBe(99999)
    })

    it('clears follower_count with null', async () => {
      const contact = await createTestCrmContact(admin)
      await updateCrmContact(admin, contact.id, { follower_count: 100 })
      const updated = await updateCrmContact(admin, contact.id, { follower_count: null })
      expect(updated.follower_count).toBeNull()
    })

    it('updates notes', async () => {
      const suffix = r()
      const contact = await createTestCrmContact(admin)
      const updated = await updateCrmContact(admin, contact.id, { notes: `Notes ${suffix}` })
      expect(updated.notes).toBe(`Notes ${suffix}`)
    })

    it('updates metadata', async () => {
      const contact = await createTestCrmContact(admin)
      const updated = await updateCrmContact(admin, contact.id, {
        metadata: { campaign: 'spring-2024' },
      })
      expect(updated.metadata).toEqual({ campaign: 'spring-2024' })
    })

    it('updates lifecycle timestamps', async () => {
      const contact = await createTestCrmContact(admin)
      const now = new Date()
      const updated = await updateCrmContact(admin, contact.id, {
        contacted_at: now,
        responded_at: now,
      })
      expect(updated.contacted_at).not.toBeNull()
      expect(updated.responded_at).not.toBeNull()
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        change_type: 'manual_update',
        changed_by_id: admin.id,
      })
      expect(changes[0].contacted_at).not.toBeNull()
      expect(changes[0].responded_at).not.toBeNull()
    })

    it('does not record manual lifecycle rows for no-op lifecycle updates', async () => {
      const now = new Date()
      const contact = await createTestCrmContact(admin)
      const updated = await updateCrmContact(admin, contact.id, {
        contacted_at: now,
        responded_at: null,
      })

      await updateCrmContact(admin, contact.id, {
        contacted_at: updated.contacted_at,
        responded_at: null,
      })

      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
    })

    it('clears lifecycle timestamps with null', async () => {
      const contact = await createTestCrmContact(admin)
      await updateCrmContact(admin, contact.id, { contacted_at: new Date() })
      const updated = await updateCrmContact(admin, contact.id, { contacted_at: null })
      expect(updated.contacted_at).toBeNull()
    })

    it('throws 422 for empty name update', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(updateCrmContact(admin, contact.id, { name: '' })).rejects.toThrow(Error)
    })

    it('throws 422 for negative follower_count update', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(updateCrmContact(admin, contact.id, { follower_count: -5 })).rejects.toThrow(
        Error,
      )
    })

    it('throws 403 for non-admin users', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        updateCrmContact(regularUser, contact.id, { name: `Hacker ${r()}` }),
      ).rejects.toThrow(Error)
    })

    it('throws 404 for non-existent contact', async () => {
      await expect(
        updateCrmContact(admin, '00000000-0000-0000-0000-000000000001', { name: `Name ${r()}` }),
      ).rejects.toThrow(Error)
    })

    it('carries opt-out forward when editing a contact email to an archived, opted-out email', async () => {
      const suffix = r()
      const optedOutEmail = `tests+opted-out-archived-${suffix}@voucha.ai`

      const optedOutContact = await createTestCrmContact(admin, { email: optedOutEmail })
      await optOutCrmContactByEmail(optedOutEmail)
      await archiveCrmContact(admin, optedOutContact.id)

      const contact = await createTestCrmContact(admin)
      expect(contact.opted_out_at).toBeNull()

      const updated = await updateCrmContact(admin, contact.id, { email: optedOutEmail })
      expect(updated.opted_out_at).not.toBeNull()
    })
  })

  describe('markCrmContactContacted', () => {
    it('sets contacted_at if not already set', async () => {
      const contact = await createTestCrmContact(admin)
      expect(contact.contacted_at).toBeNull()
      await markCrmContactContacted(contact.id, admin.id)
      const updated = await getCrmContact(contact.id)
      expect(updated!.contacted_at).not.toBeNull()
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
      expect(changes[0].change_type).toBe('mark_contacted')
      expect(changes[0].changed_by_id).toBe(admin.id)
      expect(changes[0].contacted_at?.getTime()).toBe(updated!.contacted_at?.getTime())
    })

    it('does not overwrite existing contacted_at', async () => {
      const contact = await createTestCrmContact(admin)
      await markCrmContactContacted(contact.id, admin.id)
      const first = await getCrmContact(contact.id)
      const firstContactedAt = first!.contacted_at
      await markCrmContactContacted(contact.id, admin.id)
      const second = await getCrmContact(contact.id)
      expect(second!.contacted_at?.getTime()).toBe(firstContactedAt?.getTime())
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
    })
  })
})
