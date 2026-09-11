import { describe, it, expect, afterAll } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  enableReferralProgramByTopicId,
  insertTestTopic,
} from '@voucha/test-helpers'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

const longPublicCacheControl = `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`

describe('topic.referral-program', () => {
  afterAll(async () => {}, 30000)

  describe('Topic Referral Program Routes', () => {
    describe('GET /api/v1/topics/:idOrSlug/referral-program', () => {
      it('should return referral program attributes', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-referral-${random}`,
          createdById: admin!.id,
          topicType: 'referral_program',
        })
        const companyId = await insertTestTopic({
          name: `Test Company ${random}`,
          slug: `test-company-ref-get-${random}`,
          createdById: admin!.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/topics/${topicId}/referral-program`)
          .send({ company_id: companyId })
          .expect(200)

        const response = await request.get(`/api/v1/topics/${topicId}/referral-program`).expect(200)

        expect(response.body.referral_program_attributes.company_id).toBe(companyId)
        expect(response.headers['cache-control']).toBe(longPublicCacheControl)
      })

      it('should return 400 for non-referral-program topic', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-referral-400-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/referral-program`).expect(400)
      })

      it('should return 404 when referral program attributes are missing', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-referral-missing-${random}`,
          createdById: user!.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/referral-program`).expect(404)
      })
    })

    describe('GET /api/v1/topics/:idOrSlug/referral-program/validation-info', () => {
      it('returns 404 for non-existent topic', async () => {
        const request = createRequest()
        await request
          .get(
            '/api/v1/topics/00000000-0000-0000-0000-000000000000/referral-program/validation-info',
          )
          .expect(404)
      })

      it('returns 404 when topic has no linked validation with example_urls', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-refprog-vinfo-no-rule-${random}`,
          createdById: admin!.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/referral-program/validation-info`).expect(404)
      })

      it('returns validation_info when program has a linked validation with example_urls', async () => {
        const admin = await createTestUser({ administrator: true })
        const adminRequest = createRequest()
        await adminRequest.authenticateAs(admin!)
        const random = Math.random().toString(36).slice(2, 8)

        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-refprog-vinfo-ok-${random}`,
          createdById: admin!.id,
          topicType: 'referral_program',
        })

        // Create a validation set
        const valRes = await adminRequest
          .post('/api/v1/referral-link-validations')
          .send({ slug: `vinfo_val_${random}`, user_help_text: 'Find your link in settings' })
          .expect(201)
        const validationId = valRes.body.validation.id

        // Add a rule with example_urls and is_referral_link_url
        await adminRequest
          .post(`/api/v1/referral-link-validations/${validationId}/rules`)
          .send({
            hostname: `bank-${random}.com`,
            pathname: '/ref/%',
            is_referral_link_url: true,
            example_urls: [`https://bank-${random}.com/ref/you`],
          })
          .expect(201)

        // Initialize the referral program entry, then link the validation
        await adminRequest
          .patch(`/api/v1/topics/${topicId}/referral-program`)
          .send({ company_id: null })
          .expect(200)

        await adminRequest
          .post(`/api/v1/topics/${topicId}/referral-program/link-validations`)
          .send({ validation_id: validationId })
          .expect(204)

        const request = createRequest()
        const res = await request
          .get(`/api/v1/topics/${topicId}/referral-program/validation-info`)
          .expect(200)
        expect(res.body.validation_info.user_help_text).toBe('Find your link in settings')
        expect(res.body.validation_info.example_urls).toContain(
          `https://bank-${random}.com/ref/you`,
        )
        expect(res.headers['cache-control']).toBe(longPublicCacheControl)
      })
    })

    describe('POST /api/v1/topics/:referralProgramId/referral-program/link-validations', () => {
      it('returns 401 when unauthenticated', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const user = await createTestUser()
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-link-val-401-${random}`,
          createdById: user.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request
          .post(`/api/v1/topics/${topicId}/referral-program/link-validations`)
          .send({ validation_id: '00000000-0000-0000-0000-000000000001' })
          .expect(401)
      })

      it('returns 403 for non-admin user', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-link-val-403-${random}`,
          createdById: user.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.authenticateAs(user)
        await request
          .post(`/api/v1/topics/${topicId}/referral-program/link-validations`)
          .send({ validation_id: '00000000-0000-0000-0000-000000000001' })
          .expect(403)
      })

      it('returns 422 when validation_id is missing', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-link-val-422-${random}`,
          createdById: admin.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.authenticateAs(admin)
        await request
          .post(`/api/v1/topics/${topicId}/referral-program/link-validations`)
          .send({})
          .expect(422)
      })

      it('links a validation to a referral program as admin', async () => {
        const admin = await createTestUser({ administrator: true })
        const adminRequest = createRequest()
        await adminRequest.authenticateAs(admin)
        const random = Math.random().toString(36).slice(2, 8)

        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-link-val-ok-${random}`,
          createdById: admin.id,
          topicType: 'referral_program',
        })
        const valRes = await adminRequest
          .post('/api/v1/referral-link-validations')
          .send({ slug: `link_val_${random}` })
          .expect(201)
        const validationId = valRes.body.validation.id

        await adminRequest
          .patch(`/api/v1/topics/${topicId}/referral-program`)
          .send({ company_id: null })
          .expect(200)

        await adminRequest
          .post(`/api/v1/topics/${topicId}/referral-program/link-validations`)
          .send({ validation_id: validationId })
          .expect(204)

        // Verify linked via the program attributes
        const attrRes = await adminRequest
          .get(`/api/v1/topics/${topicId}/referral-program`)
          .expect(200)
        expect(
          attrRes.body.referral_program_attributes.referral_program_link_validation_ids,
        ).toContain(validationId)
      })
    })

    describe('GET /api/v1/topics/:referralProgramId/referral-program/validations', () => {
      it('returns 401 when unauthenticated', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-get-vals-401-${random}`,
          createdById: user.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/referral-program/validations`).expect(401)
      })

      it('returns 403 for non-admin user', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-get-vals-403-${random}`,
          createdById: user.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get(`/api/v1/topics/${topicId}/referral-program/validations`).expect(403)
      })

      it('returns scoped validations for the program as admin', async () => {
        const admin = await createTestUser({ administrator: true })
        const adminRequest = createRequest()
        await adminRequest.authenticateAs(admin)
        const random = Math.random().toString(36).slice(2, 8)

        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-get-vals-ok-${random}`,
          createdById: admin.id,
          topicType: 'referral_program',
        })
        await enableReferralProgramByTopicId(topicId)

        const valRes = await adminRequest
          .post('/api/v1/referral-link-validations')
          .send({ slug: `get_vals_${random}` })
          .expect(201)
        const validationId = valRes.body.validation.id

        await adminRequest
          .post(`/api/v1/topics/${topicId}/referral-program/link-validations`)
          .send({ validation_id: validationId })
          .expect(204)

        const res = await adminRequest
          .get(`/api/v1/topics/${topicId}/referral-program/validations`)
          .expect(200)
        expect(res.body.results).toHaveLength(1)
        expect(res.body.results[0].id).toBe(validationId)
        expect(res.body.results[0].slug).toBe(`get_vals_${random}`)
      })
    })
  })
})
