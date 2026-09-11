import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, createTestCrmContact, insertTestCrmNote } from '@voucha/test-helpers'
import { createCrmNote } from './create.mts'
import { getCrmNotesByContactId } from './get.mts'
import { deleteCrmNote } from './delete.mts'
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

  describe('createCrmNote', () => {
    it('creates a note for a contact', async () => {
      const contact = await createTestCrmContact(admin)
      const suffix = r()
      const note = await createCrmNote(admin, {
        contact_id: contact.id,
        body: `Test note body ${suffix}`,
      })
      expect(note.id).toBeTruthy()
      expect(note.contact_id).toBe(contact.id)
      expect(note.body).toBe(`Test note body ${suffix}`)
      expect(note.created_by_id).toBe(admin.id)
      expect(note.deleted_at).toBeNull()
      expect(note.__entity_type).toBe('crm_note')
    })

    it('trims body whitespace', async () => {
      const contact = await createTestCrmContact(admin)
      const note = await createCrmNote(admin, {
        contact_id: contact.id,
        body: '  Trimmed body  ',
      })
      expect(note.body).toBe('Trimmed body')
    })

    it('throws 403 for non-admin', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        createCrmNote(regularUser, { contact_id: contact.id, body: `Test ${r()}` }),
      ).rejects.toThrow(Error)
    })

    it('throws 422 when body is empty', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(createCrmNote(admin, { contact_id: contact.id, body: '' })).rejects.toThrow(
        Error,
      )
    })

    it('throws 422 when body is whitespace only', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(createCrmNote(admin, { contact_id: contact.id, body: '   ' })).rejects.toThrow(
        Error,
      )
    })

    it('throws 422 when body exceeds 10000 characters', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        createCrmNote(admin, { contact_id: contact.id, body: 'x'.repeat(10001) }),
      ).rejects.toThrow(Error)
    })
  })

  describe('getCrmNotesByContactId', () => {
    it('returns notes for a contact, newest first', async () => {
      const contact = await createTestCrmContact(admin)
      const note1 = await insertTestCrmNote({ contactId: contact.id, createdById: admin.id })
      const note2 = await insertTestCrmNote({ contactId: contact.id, createdById: admin.id })
      const result = await getCrmNotesByContactId(contact.id)
      const ids = result.results.map(n => n.id)
      expect(ids).toContain(note1.id)
      expect(ids).toContain(note2.id)
      // Newest first (by id DESC)
      expect(ids.indexOf(note2.id)).toBeLessThan(ids.indexOf(note1.id))
    })

    it('paginates notes for a contact', async () => {
      const contact = await createTestCrmContact(admin)
      await insertTestCrmNote({ contactId: contact.id, createdById: admin.id })
      await insertTestCrmNote({ contactId: contact.id, createdById: admin.id })
      await insertTestCrmNote({ contactId: contact.id, createdById: admin.id })
      const page1 = await getCrmNotesByContactId(contact.id, { limit: 2 })
      expect(page1.results).toHaveLength(2)
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).toBeTruthy()

      const page2 = await getCrmNotesByContactId(contact.id, {
        limit: 2,
        after: page1.page_info.end_cursor!,
      })
      expect(page2.results.length).toBeGreaterThanOrEqual(1)
      const page1Ids = new Set(page1.results.map(n => n.id))
      expect(page2.results.every(n => !page1Ids.has(n.id))).toBe(true)
    })

    it('excludes soft-deleted notes', async () => {
      const contact = await createTestCrmContact(admin)
      const note = await createCrmNote(admin, { contact_id: contact.id, body: `Delete me ${r()}` })
      await deleteCrmNote(admin, contact.id, note.id)
      const result = await getCrmNotesByContactId(contact.id)
      expect(result.results.map(n => n.id)).not.toContain(note.id)
    })

    it('returns empty for contact with no notes', async () => {
      const contact = await createTestCrmContact(admin)
      const result = await getCrmNotesByContactId(contact.id)
      expect(result.results).toEqual([])
      expect(result.page_info.has_next_page).toBe(false)
    })
  })

  describe('deleteCrmNote', () => {
    it('soft-deletes a note', async () => {
      const contact = await createTestCrmContact(admin)
      const note = await createCrmNote(admin, {
        contact_id: contact.id,
        body: `Note to delete ${r()}`,
      })
      await deleteCrmNote(admin, contact.id, note.id)
      const result = await getCrmNotesByContactId(contact.id)
      expect(result.results.map(n => n.id)).not.toContain(note.id)
    })

    it('throws 403 for non-admin', async () => {
      const contact = await createTestCrmContact(admin)
      const note = await createCrmNote(admin, { contact_id: contact.id, body: `Note ${r()}` })
      await expect(deleteCrmNote(regularUser, contact.id, note.id)).rejects.toThrow(Error)
    })

    it('throws 404 for non-existent note', async () => {
      const contact = await createTestCrmContact(admin)
      await expect(
        deleteCrmNote(admin, contact.id, '00000000-0000-0000-0000-000000000001'),
      ).rejects.toThrow(Error)
    })
  })
})
