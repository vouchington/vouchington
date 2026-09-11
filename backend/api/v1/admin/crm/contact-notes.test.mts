import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { CrmContact } from '@voucha/types/entities/crm-contact'

describe('contact-notes', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let contact: CrmContact

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    contact = await createTestCrmContact(admin)
  })

  const FAKE_UUID = '00000000-0000-0000-0000-000000000002'

  describe('GET /api/v1/crm/contacts/:contactId/notes', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/crm/contacts/${contact.id}/notes`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/crm/contacts/${contact.id}/notes`).expect(403)
    })

    it('returns paginated notes for a contact', async () => {
      // Create a note first
      const createRequest2 = createRequest()
      await createRequest2.authenticateAs(admin)
      await createRequest2
        .post(`/api/v1/crm/contacts/${contact.id}/notes`)
        .send({ body: 'A test note' })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/crm/contacts/${contact.id}/notes`).expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns 422 for invalid contact UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/crm/contacts/not-a-uuid/notes').expect(422)
    })
  })

  describe('POST /api/v1/crm/contacts/:contactId/notes', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/notes`)
        .send({ body: 'Note' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/notes`)
        .send({ body: 'Note' })
        .expect(403)
    })

    it('creates a note for a contact', async () => {
      const noteBody = `Note body ${Math.random().toString(36).slice(2, 10)}`

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post(`/api/v1/crm/contacts/${contact.id}/notes`)
        .send({ body: noteBody })
        .expect(201)

      expect(response.body.note).toHaveProperty('id')
      expect(response.body.note).toHaveProperty('body', noteBody)
      expect(response.body.note).toHaveProperty('contact_id', contact.id)
      expect(response.body.note).toHaveProperty('__entity_type', 'crm_note')
    })

    it('returns 422 when body is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post(`/api/v1/crm/contacts/${contact.id}/notes`).send({}).expect(422)
    })
  })

  describe('DELETE /api/v1/crm/contacts/:contactId/notes/:noteId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.delete(`/api/v1/crm/contacts/${contact.id}/notes/${FAKE_UUID}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.delete(`/api/v1/crm/contacts/${contact.id}/notes/${FAKE_UUID}`).expect(403)
    })

    it('soft-deletes a note', async () => {
      // Create note
      const createReq = createRequest()
      await createReq.authenticateAs(admin)
      const createRes = await createReq
        .post(`/api/v1/crm/contacts/${contact.id}/notes`)
        .send({ body: 'To be deleted' })
        .expect(201)
      const noteId = createRes.body.note.id

      // Delete note
      const deleteReq = createRequest()
      await deleteReq.authenticateAs(admin)
      await deleteReq.delete(`/api/v1/crm/contacts/${contact.id}/notes/${noteId}`).expect(204)

      // Verify note no longer in list
      const listReq = createRequest()
      await listReq.authenticateAs(admin)
      const listRes = await listReq.get(`/api/v1/crm/contacts/${contact.id}/notes`).expect(200)
      const noteIds = listRes.body.results.map((n: { id: string }) => n.id)
      expect(noteIds).not.toContain(noteId)
    })

    it('returns 404 for non-existent note', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete(`/api/v1/crm/contacts/${contact.id}/notes/${FAKE_UUID}`).expect(404)
    })
  })
})
