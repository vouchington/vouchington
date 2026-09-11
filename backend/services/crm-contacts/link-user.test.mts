import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createTestCrmContact,
  getTestCrmContactLifecycleChanges,
} from '@voucha/test-helpers'
import { linkCrmContactToUser, unlinkCrmContactFromUser } from './link-user.mts'
import type { PrivateUser } from '@services/users/types'

describe('link-user', () => {
  const r = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser
  let targetUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser, targetUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createTestUser(),
    ])
  })

  describe('linkCrmContactToUser', () => {
    it('links a contact to a user', async () => {
      const contact = await createTestCrmContact(admin)
      expect(contact.user_id).toBeNull()
      const updated = await linkCrmContactToUser(admin, contact.id, targetUser.id)
      expect(updated.user_id).toBe(targetUser.id)
      expect(updated.id).toBe(contact.id)
      expect(updated.__entity_type).toBe('crm_contact')
    })

    it('sets converted_at when linking', async () => {
      const contact = await createTestCrmContact(admin)
      expect(contact.converted_at).toBeNull()
      const updated = await linkCrmContactToUser(admin, contact.id, targetUser.id)
      expect(updated.converted_at).not.toBeNull()
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        change_type: 'mark_converted',
        changed_by_id: admin.id,
      })
      expect(changes[0].converted_at?.getTime()).toBe(updated.converted_at?.getTime())
    })

    it('does not overwrite existing converted_at when re-linking', async () => {
      const contact = await createTestCrmContact(admin)
      const first = await linkCrmContactToUser(admin, contact.id, targetUser.id)
      const firstConvertedAt = first.converted_at
      const anotherTarget = await createTestUser()
      const second = await linkCrmContactToUser(admin, contact.id, anotherTarget.id)
      expect(second.converted_at?.getTime()).toBe(firstConvertedAt?.getTime())
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes.map(change => change.change_type)).toEqual(['mark_converted'])
    })

    it('throws 403 for non-admin', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(linkCrmContactToUser(regularUser, contact.id, targetUser.id)).rejects.toThrow(
        Error,
      )
    })

    it('throws 404 for non-existent contact', async () => {
      await expect(
        linkCrmContactToUser(admin, '00000000-0000-0000-0000-000000000001', targetUser.id),
      ).rejects.toThrow(Error)
    })

    it('throws on invalid user_id UUID', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(linkCrmContactToUser(admin, contact.id, `not-a-uuid-${r()}`)).rejects.toThrow(
        Error,
      )
    })
  })

  describe('unlinkCrmContactFromUser', () => {
    it('unlinks a contact from a user', async () => {
      const contact = await createTestCrmContact(admin)
      await linkCrmContactToUser(admin, contact.id, targetUser.id)
      const unlinked = await unlinkCrmContactFromUser(admin, contact.id)
      expect(unlinked.user_id).toBeNull()
      expect(unlinked.id).toBe(contact.id)
      const changes = await getTestCrmContactLifecycleChanges(contact.id)
      expect(changes.map(change => change.change_type)).toEqual([
        'mark_converted',
        'clear_converted',
      ])
      expect(changes[1].converted_at).toBeNull()
    })

    it('is idempotent when contact is already unlinked', async () => {
      const contact = await createTestCrmContact(admin)
      const result = await unlinkCrmContactFromUser(admin, contact.id)
      expect(result.user_id).toBeNull()
    })

    it('throws 403 for non-admin', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(unlinkCrmContactFromUser(regularUser, contact.id)).rejects.toThrow(Error)
    })

    it('throws 404 for non-existent contact', async () => {
      await expect(
        unlinkCrmContactFromUser(admin, '00000000-0000-0000-0000-000000000001'),
      ).rejects.toThrow(Error)
    })
  })
})
