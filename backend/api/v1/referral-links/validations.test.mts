import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'

describe('validations', () => {
  let regularUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  beforeAll(async () => {
    regularUser = await createTestUserDirect()
    adminUser = await createTestUserDirect()
    await addUserRole(adminUser!.id, 'administrator')
  })

  describe('Referral Link Validations Routes', () => {
    it('GET /api/v1/referral-link-validations is public and supports query params', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/referral-link-validations?limit=5').expect(200)

      expect(response.body.results).toBeDefined()
      expect(response.body.page_info).toBeDefined()
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('POST /api/v1/referral-link-validations requires auth and admin permissions', async () => {
      const unauthenticated = createRequest()
      await unauthenticated
        .post('/api/v1/referral-link-validations')
        .send({ slug: `validation_${Date.now()}` })
        .expect(401)

      const requestAsUser = createRequest()
      await requestAsUser.authenticateAs(regularUser!)

      await requestAsUser.post('/api/v1/referral-link-validations').send('not json').expect(415)
      await requestAsUser.post('/api/v1/referral-link-validations').send({}).expect(422)

      await requestAsUser
        .post('/api/v1/referral-link-validations')
        .send({ slug: `validation_${Date.now()}` })
        .expect(403)
    })

    it('creates, reads, updates, and deletes validation as admin', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      const slug = `validation_${Date.now()}`
      const created = await request
        .post('/api/v1/referral-link-validations')
        .send({ slug, user_help_text: 'created from api test' })
        .expect(201)
      expect(created.body.validation.slug).toBe(slug)

      const bySlug = await request.get(`/api/v1/referral-link-validations/${slug}`).expect(200)
      expect(bySlug.body.validation.id).toBe(created.body.validation.id)

      const updated = await request
        .patch(`/api/v1/referral-link-validations/${created.body.validation.id}`)
        .send({ user_help_text: 'updated text' })
        .expect(200)
      expect(updated.body.validation.user_help_text).toBe('updated text')

      await request
        .delete(`/api/v1/referral-link-validations/${created.body.validation.id}`)
        .expect(204)

      await request
        .get(`/api/v1/referral-link-validations/${created.body.validation.id}`)
        .expect(404)
    })

    it('PATCH validates content-type and missing resources', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      const missingId = '00000000-0000-0000-0000-000000000000'

      await request
        .patch(`/api/v1/referral-link-validations/${missingId}`)
        .send('not json')
        .expect(415)
      await request
        .patch(`/api/v1/referral-link-validations/${missingId}`)
        .send({ user_help_text: 'nope' })
        .expect(404)
    })

    it('GET returns 400 for a non-name cursor', async () => {
      // Encode a SimpleCursor (id-only) which is not a NameCursor
      const invalidCursor = Buffer.from(JSON.stringify({ id: 'some-id' })).toString('base64')
      const request = createRequest()
      await request
        .get(`/api/v1/referral-link-validations?after=${encodeURIComponent(invalidCursor)}`)
        .expect(400)
    })

    it('GET supports cursor-based pagination', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)
      const ts = Date.now()
      const prefix = `cursor_pg_${ts}`

      // Create 2 validations with a common prefix
      for (let i = 1; i <= 2; i++) {
        await request
          .post('/api/v1/referral-link-validations')
          .send({ slug: `${prefix}_${i}` })
          .expect(201)
      }

      // Fetch page 1 of size 1
      const publicRequest = createRequest()
      const page1 = await publicRequest
        .get(`/api/v1/referral-link-validations?limit=1&search=${encodeURIComponent(prefix)}`)
        .expect(200)

      expect(page1.body.results).toHaveLength(1)
      expect(page1.body.page_info.has_next_page).toBe(true)
      const cursor = page1.body.page_info.end_cursor

      // Fetch page 2 using the cursor (cursor-only, no search)
      const page2 = await publicRequest
        .get(`/api/v1/referral-link-validations?limit=1&after=${encodeURIComponent(cursor)}`)
        .expect(200)

      expect(page2.body.results).toHaveLength(1)
      expect(page2.body.results[0].slug).not.toBe(page1.body.results[0].slug)
    })

    it('GET supports search combined with cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)
      const ts = Date.now()
      const prefix = `srch_cursor_${ts}`

      // Create 2 validations with a common prefix
      for (let i = 1; i <= 2; i++) {
        await request
          .post('/api/v1/referral-link-validations')
          .send({ slug: `${prefix}_${i}` })
          .expect(201)
      }

      const publicRequest2 = createRequest()
      // Get first page with search
      const page1 = await publicRequest2
        .get(`/api/v1/referral-link-validations?limit=1&search=${encodeURIComponent(prefix)}`)
        .expect(200)

      expect(page1.body.results).toHaveLength(1)
      expect(page1.body.page_info.has_next_page).toBe(true)
      const cursor = page1.body.page_info.end_cursor

      // Get second page with search + cursor
      const page2 = await publicRequest2
        .get(
          `/api/v1/referral-link-validations?limit=1&search=${encodeURIComponent(prefix)}&after=${encodeURIComponent(cursor)}`,
        )
        .expect(200)

      expect(page2.body.results).toHaveLength(1)
      expect(page2.body.results[0].slug).not.toBe(page1.body.results[0].slug)
    })
  })
})
