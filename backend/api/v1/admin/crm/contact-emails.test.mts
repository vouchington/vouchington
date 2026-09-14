import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { CrmContact } from '@voucha/types/entities/crm-contact'

describe('contact-emails', () => {
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

  describe('GET /api/v1/crm/contacts/:contactId/emails', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/crm/contacts/${contact.id}/emails`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get(`/api/v1/crm/contacts/${contact.id}/emails`).expect(403)
    })

    it('returns paginated messages for a contact', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/crm/contacts/${contact.id}/emails`).expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns 422 for invalid contact UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/crm/contacts/not-a-uuid/emails').expect(422)
    })
  })

  describe('POST /api/v1/crm/contacts/:contactId/emails', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/emails`)
        .send({ subject: 'Test', body_html: '<p>Hello</p>', email_provider: 'ses' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/emails`)
        .send({ subject: 'Test', body_html: '<p>Hello</p>', email_provider: 'ses' })
        .expect(403)
    })

    it('creates an email message record', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const emailContact = await createTestCrmContact(admin)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post(`/api/v1/crm/contacts/${emailContact.id}/emails`)
        .send({
          subject: `Test subject ${suffix}`,
          body_html: '<p>Hello world</p>',
          email_provider: 'ses',
        })
        .expect(201)

      expect(response.body.message).toHaveProperty('id')
      expect(response.body.message).toHaveProperty('subject', `Test subject ${suffix}`)
      expect(response.body.message).toHaveProperty('direction', 'outbound')
      expect(response.body.message).toHaveProperty('__entity_type', 'crm_message')
    })

    it('message appears in contact emails list', async () => {
      const listContact = await createTestCrmContact(admin)

      const sendReq = createRequest()
      await sendReq.authenticateAs(admin)
      const sendRes = await sendReq
        .post(`/api/v1/crm/contacts/${listContact.id}/emails`)
        .send({
          subject: 'List test email',
          body_text: 'Plain text body',
          email_provider: 'ses',
        })
        .expect(201)
      const messageId = sendRes.body.message.id

      const listReq = createRequest()
      await listReq.authenticateAs(admin)
      const listRes = await listReq.get(`/api/v1/crm/contacts/${listContact.id}/emails`).expect(200)

      const messageIds = listRes.body.results.map((m: { id: string }) => m.id)
      expect(messageIds).toContain(messageId)
    })

    it('returns 422 when subject is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/emails`)
        .send({ body_html: '<p>Test</p>', email_provider: 'ses' })
        .expect(422)
    })

    it('returns 422 when body is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/emails`)
        .send({ subject: 'Test', email_provider: 'ses' })
        .expect(422)
    })

    it('returns 422 for invalid email_provider', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post(`/api/v1/crm/contacts/${contact.id}/emails`)
        .send({ subject: 'Test', body_html: '<p>Hi</p>', email_provider: 'unknown' })
        .expect(422)
    })
  })
})
