import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import { appAttestationConfig } from '@services/app-attestation'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'

const validAttest = { keyId: 'a2V5', attestation: 'YXR0ZXN0', challengeId: 'challenge-1' }

describe('app attestation routes - request contract validation', () => {
  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  }, 15_000)

  beforeEach(() => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
  })

  afterEach(() => {
    deleteDynamicConfigFieldsForTest(
      appAttestationConfig,
      Object.keys(appAttestationConfig.fieldTypes),
    )
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  describe('POST /api/v1/app-attestation/challenge', () => {
    it.each([
      ['a non-string type', { type: 5 }],
      ['an unknown type', { type: 'bogus' }],
      ['an unknown field', { type: 'attestation', extra: true }],
    ])('returns 422 for %s', async (_name, body) => {
      await createRequest().post('/api/v1/app-attestation/challenge').send(body).expect(422)
    })

    it('returns the feature-flag 403 before validating a malformed body', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: false })
      const response = await createRequest()
        .post('/api/v1/app-attestation/challenge')
        .send({ type: 5 })
        .expect(403)
      expect(response.body.message).toBe('App Attest is not enabled')
    })
  })

  describe('POST /api/v1/app-attestation/attest', () => {
    it.each([
      ['a non-string keyId', { ...validAttest, keyId: 5 }],
      ['a non-string attestation', { ...validAttest, attestation: { nested: true } }],
      ['a non-string challengeId', { ...validAttest, challengeId: ['x'] }],
      ['a missing challengeId', { keyId: 'a2V5', attestation: 'YXR0ZXN0' }],
      ['an unknown field', { ...validAttest, extra: true }],
      ['snake_case keys in place of the camelCase contract', { key_id: 'a2V5' }],
    ])('returns 422 for %s', async (_name, body) => {
      await createRequest().post('/api/v1/app-attestation/attest').send(body).expect(422)
    })

    it('returns 422 for an empty required string', async () => {
      await createRequest()
        .post('/api/v1/app-attestation/attest')
        .send({ ...validAttest, keyId: '' })
        .expect(422)
    })

    it('returns the feature-flag 403 before validating a malformed body', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: false })
      const response = await createRequest()
        .post('/api/v1/app-attestation/attest')
        .send({ keyId: 5 })
        .expect(403)
      expect(response.body.message).toBe('App Attest is not enabled')
    })
  })
})
