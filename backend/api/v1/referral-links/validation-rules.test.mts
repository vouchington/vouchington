import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'

describe('validation-rules', () => {
  let regularUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let validationId: string | null = null

  beforeAll(async () => {
    regularUser = await createTestUserDirect()
    adminUser = await createTestUserDirect()
    await addUserRole(adminUser!.id, 'administrator')

    const fixture = await createReferralProgramFixture({ createdById: regularUser!.id })
    validationId = fixture.validationId
  })
  describe('Referral Link Validation Rules Routes', () => {
    it('GET /api/v1/referral-link-validations/:validationId/rules is public', async () => {
      const request = createRequest()
      const response = await request
        .get(`/api/v1/referral-link-validations/${validationId}/rules?limit=10`)
        .expect(200)

      expect(response.body.results).toBeDefined()
      expect(response.body.page_info).toBeDefined()
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('rejects malformed validation and rule UUIDs before service access', async () => {
      const request = createRequest()
      await request.get('/api/v1/referral-link-validations/not-a-uuid/rules').expect(422)

      await request.authenticateAs(adminUser!)
      await request
        .delete(`/api/v1/referral-link-validations/${validationId}/rules/not-a-uuid`)
        .expect(422)
    })

    it('POST /api/v1/referral-link-validations/:validationId/rules validates auth, content-type, and required fields', async () => {
      const unauthenticated = createRequest()
      await unauthenticated
        .post(`/api/v1/referral-link-validations/${validationId}/rules`)
        .send({ hostname: 'example.com', pathname: '/x' })
        .expect(401)

      const requestAsUser = createRequest()
      await requestAsUser.authenticateAs(regularUser!)

      await requestAsUser
        .post(`/api/v1/referral-link-validations/${validationId}/rules`)
        .send('not json')
        .expect(415)

      await requestAsUser
        .post(`/api/v1/referral-link-validations/${validationId}/rules`)
        .send({})
        .expect(403)

      await requestAsUser
        .post(`/api/v1/referral-link-validations/${validationId}/rules`)
        .send({ hostname: 'example.com', pathname: '/x' })
        .expect(403)
    })

    it('creates, updates, and deletes a rule as admin', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      const created = await request
        .post(`/api/v1/referral-link-validations/${validationId}/rules`)
        .send({
          hostname: 'example.com',
          pathname: '/ref/%',
          is_referral_link_url: null,
          is_invalid_referral_link_url: null,
        })
        .expect(201)
      expect(created.body.validation_rule.hostname).toBe('example.com')
      expect(created.body.validation_rule.is_referral_link_url).toBe(true)
      expect(created.body.validation_rule.is_invalid_referral_link_url).toBe(false)

      await request
        .patch(
          `/api/v1/referral-link-validations/${validationId}/rules/${created.body.validation_rule.id}`,
        )
        .send({ is_referral_link_url: null })
        .expect(422)

      const updated = await request
        .patch(
          `/api/v1/referral-link-validations/${validationId}/rules/${created.body.validation_rule.id}`,
        )
        .send({ user_error_text: 'updated rule message' })
        .expect(200)

      expect(updated.body.validation_rule.user_error_text).toBe('updated rule message')

      await request
        .delete(
          `/api/v1/referral-link-validations/${validationId}/rules/${created.body.validation_rule.id}`,
        )
        .expect(204)

      await request
        .patch(
          `/api/v1/referral-link-validations/${validationId}/rules/${created.body.validation_rule.id}`,
        )
        .send({ user_error_text: 'should be missing' })
        .expect(404)
    })

    it('PATCH validates content-type and missing resource behavior', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser!)

      const missingRuleId = '00000000-0000-0000-0000-000000000000'

      await request
        .patch(`/api/v1/referral-link-validations/${validationId}/rules/${missingRuleId}`)
        .send('not json')
        .expect(415)

      await request
        .patch(`/api/v1/referral-link-validations/${validationId}/rules/${missingRuleId}`)
        .send({ user_error_text: 'missing' })
        .expect(404)

      await request
        .delete(`/api/v1/referral-link-validations/${validationId}/rules/${missingRuleId}`)
        .expect(404)
    })
  })
})
