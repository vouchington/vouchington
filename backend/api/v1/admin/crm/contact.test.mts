import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { CrmContact } from '@voucha/types/entities/crm-contact'

describe('contact', () => {
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

  const FAKE_UUID = '00000000-0000-0000-0000-000000000001'

  describe('GET /api/v1/crm/contacts/:contactId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/crm/contacts/${contact.id}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/crm/contacts/${contact.id}`).expect(403)
    })

    it('returns the contact with social accounts', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/crm/contacts/${contact.id}`).expect(200)

      expect(response.body.contact).toHaveProperty('id', contact.id)
      expect(response.body.contact).toHaveProperty('name', contact.name)
      expect(response.body.contact).toHaveProperty('email', contact.email)
      expect(response.body).toHaveProperty('social_accounts')
      expect(Array.isArray(response.body.social_accounts)).toBe(true)
    })

    it('returns 422 for invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/crm/contacts/not-a-uuid').expect(422)
    })

    it('returns 404 for non-existent contact', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/crm/contacts/${FAKE_UUID}`).expect(404)
    })
  })

  describe('PATCH /api/v1/crm/contacts/:contactId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .patch(`/api/v1/crm/contacts/${contact.id}`)
        .send({ notes: 'update' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .patch(`/api/v1/crm/contacts/${contact.id}`)
        .send({ notes: 'update' })
        .expect(403)
    })

    it('updates contact fields', async () => {
      const patchContact = await createTestCrmContact(admin)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/crm/contacts/${patchContact.id}`)
        .send({ notes: 'Updated notes', vertical: 'finance' })
        .expect(200)

      expect(response.body.contact).toHaveProperty('id', patchContact.id)
      expect(response.body.contact).toHaveProperty('notes', 'Updated notes')
      expect(response.body.contact).toHaveProperty('vertical', 'finance')
    })

    it('returns 422 for invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch('/api/v1/crm/contacts/not-a-uuid').send({ notes: 'x' }).expect(422)
    })

    it('returns 415 without JSON content type', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch(`/api/v1/crm/contacts/${contact.id}`)
        .set('Content-Type', 'text/plain')
        .send('notes=x')
        .expect(415)
    })
  })

  describe('DELETE /api/v1/crm/contacts/:contactId', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.delete(`/api/v1/crm/contacts/${contact.id}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.delete(`/api/v1/crm/contacts/${contact.id}`).expect(403)
    })

    it('archives the contact (soft delete)', async () => {
      const deleteContact = await createTestCrmContact(admin)

      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete(`/api/v1/crm/contacts/${deleteContact.id}`).expect(204)

      // Archived contacts are still accessible by ID, but archived_at is now set
      const getRequest = createRequest()
      await getRequest.authenticateAs(admin)
      const response = await getRequest.get(`/api/v1/crm/contacts/${deleteContact.id}`).expect(200)
      expect(response.body.contact.archived_at).not.toBeNull()
    })

    it('returns 422 for invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete('/api/v1/crm/contacts/not-a-uuid').expect(422)
    })
  })
})
