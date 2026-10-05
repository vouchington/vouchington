import { describe, it, expect, afterAll } from 'vitest'

import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  enableReferralProgramByTopicId,
  insertTestTopic,
} from '@voucha/test-helpers'
import { registerTopicProgramAttributeRouteTests } from '../../../../test-helpers/topic-program-attribute-route-tests.mts'

describe('topic.referral-program', () => {
  afterAll(async () => {}, 30000)

  describe('Topic Referral Program Routes', () => {
    describe('DELETE /api/v1/topics/:referralProgramId/referral-program/link-validations/:validationId', () => {
      it('returns 401 when unauthenticated', async () => {
        const request = createRequest()
        await request
          .delete(
            '/api/v1/topics/00000000-0000-0000-0000-000000000001/referral-program/link-validations/00000000-0000-0000-0000-000000000002',
          )
          .expect(401)
      })

      it('unlinks a validation from a referral program as admin', async () => {
        const admin = await createTestUser({ administrator: true })
        const adminRequest = createRequest()
        await adminRequest.authenticateAs(admin)
        const random = Math.random().toString(36).slice(2, 8)

        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-unlink_val_${random}`,
          createdById: admin.id,
          topicType: 'referral_program',
        })
        const valRes = await adminRequest
          .post('/api/v1/referral-link-validations')
          .send({ slug: `unlink_val_${random}` })
          .expect(201)
        const validationId = valRes.body.validation.id

        await adminRequest
          .patch(`/api/v1/topics/${topicId}/referral-program`)
          .send({ company_topic_id: null })
          .expect(200)

        // Link first
        await adminRequest
          .post(`/api/v1/topics/${topicId}/referral-program/link-validations`)
          .send({ validation_id: validationId })
          .expect(204)

        // Then unlink
        await adminRequest
          .delete(`/api/v1/topics/${topicId}/referral-program/link-validations/${validationId}`)
          .expect(204)
      })
    })

    describe('POST /api/v1/topics/:referralProgramId/referral-program/validations', () => {
      it('returns 401 when unauthenticated', async () => {
        const request = createRequest()
        await request
          .post('/api/v1/topics/00000000-0000-0000-0000-000000000001/referral-program/validations')
          .send({ slug: 'test-slug' })
          .expect(401)
      })

      it('returns 403 for non-admin user', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-create-link-val-403-${random}`,
          createdById: user.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.authenticateAs(user)
        await request
          .post(`/api/v1/topics/${topicId}/referral-program/validations`)
          .send({ slug: 'test-slug' })
          .expect(403)
      })

      it('returns 422 when slug is missing', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-create-link-val-422-${random}`,
          createdById: admin.id,
          topicType: 'referral_program',
        })
        const request = createRequest()
        await request.authenticateAs(admin)
        await request
          .post(`/api/v1/topics/${topicId}/referral-program/validations`)
          .send({})
          .expect(422)
      })

      it('creates and links the validation atomically', async () => {
        const admin = await createTestUser({ administrator: true })
        const adminRequest = createRequest()
        await adminRequest.authenticateAs(admin)
        const random = Math.random().toString(36).slice(2, 8)

        const topicId = await insertTestTopic({
          name: `Test Referral Program ${random}`,
          slug: `test-create-link-val-ok-${random}`,
          createdById: admin.id,
          topicType: 'referral_program',
        })
        await enableReferralProgramByTopicId(topicId)

        const res = await adminRequest
          .post(`/api/v1/topics/${topicId}/referral-program/validations`)
          .send({ slug: `create_link_val_${random}`, user_help_text: 'Test help' })
          .expect(201)

        expect(res.body.validation).toMatchObject({
          slug: `create_link_val_${random}`,
          user_help_text: 'Test help',
        })
        expect(res.body.validation.id).toBeDefined()

        // Verify the validation is linked via GET
        const listRes = await adminRequest
          .get(`/api/v1/topics/${topicId}/referral-program/validations`)
          .expect(200)
        expect(listRes.body.results).toHaveLength(1)
        expect(listRes.body.results[0].id).toBe(res.body.validation.id)
      })

      it('rolls back the create when the referralProgramId does not exist', async () => {
        const admin = await createTestUser({ administrator: true })
        const adminRequest = createRequest()
        await adminRequest.authenticateAs(admin)
        const random = Math.random().toString(36).slice(2, 8)
        const slug = `orphan_test_${random}`

        // POST with a non-existent referralProgramId — assertReferralProgramExists throws 422
        await adminRequest
          .post('/api/v1/topics/00000000-0000-0000-0000-000000000001/referral-program/validations')
          .send({ slug })
          .expect(422)

        // Same slug should be creatable, proving no orphaned row was left behind
        const res = await adminRequest
          .post('/api/v1/referral-link-validations')
          .send({ slug })
          .expect(201)
        expect(res.body.validation.slug).toBe(slug)
      })
    })

    registerTopicProgramAttributeRouteTests(
      'referral',
      ['patch'],
      `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
    )
  })
})
