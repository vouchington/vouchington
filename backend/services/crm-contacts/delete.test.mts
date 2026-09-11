import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createTestCrmContact,
  getTestCrmContactLifecycleChanges,
} from '@voucha/test-helpers'
import { archiveCrmContact } from './delete.mts'
import { getCrmContact } from './get.mts'
import type { PrivateUser } from '@services/users/types'

describe('delete', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('archiveCrmContact', () => {
    it('sets archived_at on the contact', async () => {
      const contact = await createTestCrmContact(admin)
      expect(contact.archived_at).toBeNull()
      await archiveCrmContact(admin, contact.id)
      const updated = await getCrmContact(contact.id)
      expect(updated!.archived_at).not.toBeNull()
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        change_type: 'archive',
        changed_by_id: admin.id,
      })
      expect(changes[0].archived_at?.getTime()).toBe(updated!.archived_at?.getTime())
    })

    it('is idempotent when archiving twice', async () => {
      const contact = await createTestCrmContact(admin)
      await archiveCrmContact(admin, contact.id)
      const first = await getCrmContact(contact.id)
      const firstArchivedAt = first!.archived_at
      await archiveCrmContact(admin, contact.id)
      const second = await getCrmContact(contact.id)
      // archived_at should not change after second archive
      expect(second!.archived_at?.getTime()).toBe(firstArchivedAt?.getTime())
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
    })

    it('contact remains accessible after archive', async () => {
      const contact = await createTestCrmContact(admin)
      await archiveCrmContact(admin, contact.id)
      const archived = await getCrmContact(contact.id)
      expect(archived).not.toBeNull()
      expect(archived!.id).toBe(contact.id)
      expect(archived!.archived_at).not.toBeNull()
    })

    it('throws 403 for non-admin', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(archiveCrmContact(regularUser, contact.id)).rejects.toThrow(Error)
    })

    it('throws 404 for non-existent contact', async () => {
      await expect(
        archiveCrmContact(admin, '00000000-0000-0000-0000-000000000001'),
      ).rejects.toThrow(Error)
    })
  })
})
