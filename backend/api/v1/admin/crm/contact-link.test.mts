import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { CrmContact } from '@voucha/types/entities/crm-contact'

describe('contact-link', () => {
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

  const FAKE_UUID = '00000000-0000-0000-0000-000000000003'

  describe('PUT /api/v1/crm/contacts/:contactId/user-link', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .put(`/api/v1/crm/contacts/${contact.id}/user-link`)
        .send({ user_id: regularUser.id })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .put(`/api/v1/crm/contacts/${contact.id}/user-link`)
        .send({ user_id: regularUser.id })
        .expect(403)
    })

    it('links a contact to a user', async () => {
      const linkContact = await createTestCrmContact(admin)
      const targetUser = await createTestUser()

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .put(`/api/v1/crm/contacts/${linkContact.id}/user-link`)
        .send({ user_id: targetUser.id })
        .expect(200)

      expect(response.body.contact).toHaveProperty('id', linkContact.id)
      expect(response.body.contact).toHaveProperty('user_id', targetUser.id)
    })

    it('returns 422 for invalid user_id', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .put(`/api/v1/crm/contacts/${contact.id}/user-link`)
        .send({ user_id: 'not-a-uuid' })
        .expect(422)
    })

    it('returns 422 for invalid contact UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .put('/api/v1/crm/contacts/not-a-uuid/user-link')
        .send({ user_id: FAKE_UUID })
        .expect(422)
    })
  })

  describe('DELETE /api/v1/crm/contacts/:contactId/user-link', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.delete(`/api/v1/crm/contacts/${contact.id}/user-link`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.delete(`/api/v1/crm/contacts/${contact.id}/user-link`).expect(403)
    })

    it('unlinks a contact from a user', async () => {
      const unlinkContact = await createTestCrmContact(admin)
      const targetUser = await createTestUser()

      // Link first
      const linkReq = createRequest()
      await linkReq.authenticateAs(admin)
      await linkReq
        .put(`/api/v1/crm/contacts/${unlinkContact.id}/user-link`)
        .send({ user_id: targetUser.id })
        .expect(200)

      // Then unlink
      const unlinkReq = createRequest()
      await unlinkReq.authenticateAs(admin)
      const response = await unlinkReq
        .delete(`/api/v1/crm/contacts/${unlinkContact.id}/user-link`)
        .expect(200)

      expect(response.body.contact).toHaveProperty('user_id', null)
    })

    it('returns 404 for non-existent contact', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete(`/api/v1/crm/contacts/${FAKE_UUID}/user-link`).expect(404)
    })
  })
})
