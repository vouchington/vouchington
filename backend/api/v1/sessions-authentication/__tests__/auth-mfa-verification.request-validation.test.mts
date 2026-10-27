import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTotpMfaLoginAttempt } from '@voucha/test-helpers/services/mfa/totp-login-attempt'
import { createTestUser, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import { countMfaLoginAttempt, createLoginAttempt } from '@services/mfa/login-attempt'
import { v7 } from 'uuid'

const MFA_FAILURE_STATUSES = [401, 401, 401, 401, 401, 401, 429] as const

describe('MFA login verification - request contract validation', () => {
  it('does not charge malformed TOTP login requests, while valid-shaped failures still exhaust the budget', async () => {
    const { attemptId } = await createTotpMfaLoginAttempt('schema-budget')
    const route = '/api/v1/auth/mfa/totp/verification'

    for (const malformedCode of MFA_FAILURE_STATUSES.map(() => ({}))) {
      await createRequest()
        .post(route)
        .send({ login_attempt_id: attemptId, code: malformedCode })
        .expect(422)
    }

    for (const expectedStatus of MFA_FAILURE_STATUSES) {
      await createRequest()
        .post(route)
        .send({ login_attempt_id: attemptId, code: '000000' })
        .expect(expectedStatus)
    }
  }, 20_000)

  it('does not charge malformed passkey requests, while a valid-shaped failed factor still counts', async () => {
    const attempt = {
      userId: v7(),
      deviceId: v7(),
      sessionId: v7(),
      firstFactor: { type: 'email' as const, emailAddress: 'tests+schema@voucha.ai' },
    }
    const attemptId = await createLoginAttempt(attempt)
    const route = '/api/v1/auth/mfa/passkeys/authentication/verification'

    for (const extra of MFA_FAILURE_STATUSES.map(String)) {
      await createRequest()
        .post(route)
        .send({ login_attempt_id: attemptId, response: {}, extra })
        .expect(422)
    }

    for (let index = 0; index < 5; index++) {
      await expect(countMfaLoginAttempt(attemptId, attempt)).resolves.toBe(false)
    }
    const invalidFactor = {}
    await createRequest()
      .post(route)
      .send({ login_attempt_id: attemptId, response: invalidFactor })
      .expect(400)
    await createRequest()
      .post(route)
      .send({ login_attempt_id: attemptId, response: invalidFactor })
      .expect(429)
  }, 20_000)

  it('does not charge malformed TOTP reauthentication requests, while valid-shaped failures still exhaust the budget', async () => {
    const user = await createTestUser()
    const suffix = `reauth-schema-budget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await insertTestTotpAuthenticator(user.id, suffix)
    const request = createRequest()
    await request.authenticateAs(user)
    const route = '/api/v1/auth/mfa/re-auth/totp/verification'

    for (const malformedCode of MFA_FAILURE_STATUSES.map(() => ({}))) {
      await request.post(route).send({ code: malformedCode }).expect(422)
    }

    for (const expectedStatus of MFA_FAILURE_STATUSES) {
      await request.post(route).send({ code: '000000' }).expect(expectedStatus)
    }
  }, 20_000)

  it.each([
    {
      route: '/api/v1/auth/mfa/totp/verification',
      otherValidFields: { code: '123456' },
    },
    {
      route: '/api/v1/auth/mfa/passkeys/authentication/verification',
      otherValidFields: { response: {} },
    },
  ])(
    'returns 422 for a non-string login_attempt_id on POST $route',
    async ({ route, otherValidFields }) => {
      const response = await createRequest()
        .post(route)
        .send({ login_attempt_id: 123, ...otherValidFields })
        .expect(422)

      expect(response.body.message).toContain('login_attempt_id is required')
    },
  )
})
