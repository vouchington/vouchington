import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestCrmContact } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('contacts', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  describe('GET /api/v1/crm/contacts', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/crm/contacts').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/crm/contacts').expect(403)
    })

    it('returns paginated contacts for admin', async () => {
      await createTestCrmContact(admin)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/crm/contacts').expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('filters contacts by search query', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const contact = await createTestCrmContact(admin, {
        name: `SearchTestContact-${suffix}`,
        email: `tests+search-${suffix}@voucha.ai`,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/crm/contacts?q=${suffix}`).expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(contact.id)
    })

    it('filters contacts by vertical', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)
      const contact = await createTestCrmContact(admin, {
        name: `VerticalContact-${suffix}`,
        email: `tests+vertical-${suffix}@voucha.ai`,
        vertical: 'travel',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      // Use q= text filter to isolate this test's contact from accumulated data
      const response = await request
        .get(`/api/v1/crm/contacts?vertical=travel&q=VerticalContact-${suffix}`)
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(contact.id)
    })
  })

  describe('POST /api/v1/crm/contacts', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/crm/contacts')
        .send({ name: 'Test', email: 'tests+test@voucha.ai' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post('/api/v1/crm/contacts')
        .send({ name: 'Test', email: 'tests+test@voucha.ai' })
        .expect(403)
    })

    it('creates a contact with required fields', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post('/api/v1/crm/contacts')
        .send({
          name: `New Contact ${suffix}`,
          email: `tests+new-contact-${suffix}@voucha.ai`,
        })
        .expect(201)

      expect(response.body.contact).toHaveProperty('id')
      expect(response.body.contact).toHaveProperty('name', `New Contact ${suffix}`)
      expect(response.body.contact).toHaveProperty('email', `tests+new-contact-${suffix}@voucha.ai`)
      expect(response.body.contact).toHaveProperty('__entity_type', 'crm_contact')
    })

    it('creates a contact with all optional fields', async () => {
      const suffix = Math.random().toString(36).slice(2, 10)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post('/api/v1/crm/contacts')
        .send({
          name: `Full Contact ${suffix}`,
          email: `tests+full-${suffix}@voucha.ai`,
          vertical: 'ai',
          contact_type: 'influencer',
          follower_count: 10000,
          notes: 'Test notes',
          social_accounts: [{ platform: 'instagram', handle: `test_${suffix}` }],
        })
        .expect(201)

      expect(response.body.contact).toHaveProperty('vertical', 'ai')
      expect(response.body.contact).toHaveProperty('contact_type', 'influencer')
      expect(response.body.contact).toHaveProperty('follower_count', 10000)
    })

    it('returns 422 when name is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/crm/contacts').send({ email: 'tests+test@voucha.ai' }).expect(422)
    })

    it('returns 422 when email is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/crm/contacts').send({ name: 'Test' }).expect(422)
    })

    it('returns 415 without JSON content type', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/crm/contacts')
        .set('Content-Type', 'text/plain')
        .send('name=test')
        .expect(415)
    })
  })
})
