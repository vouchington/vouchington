import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import { appAttestationConfig, getAndDeleteAppAttestChallenge } from '@services/app-attestation'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'

describe('POST /api/v1/app-attestation/challenge', () => {
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

  it.each(['attestation', 'assertion'] as const)(
    'issues a single-use %s challenge that round-trips through Valkey',
    async type => {
      const req = createRequest()
      const res = await req.post('/api/v1/app-attestation/challenge').send({ type }).expect(200)

      expect(typeof res.body.challenge_id).toBe('string')
      expect(typeof res.body.challenge).toBe('string')

      const stored = await getAndDeleteAppAttestChallenge(type, res.body.challenge_id)
      expect(stored).toBe(res.body.challenge)

      // Single-use: a second get-and-delete for the same id finds nothing.
      const second = await getAndDeleteAppAttestChallenge(type, res.body.challenge_id)
      expect(second).toBeNull()
    },
  )

  it('rejects an unrecognised type', async () => {
    const req = createRequest()
    const res = await req
      .post('/api/v1/app-attestation/challenge')
      .send({ type: 'bogus' })
      .expect(422)

    expect(res.body.message).toContain('type must be')
  })

  it('rejects a missing type', async () => {
    const req = createRequest()
    await req.post('/api/v1/app-attestation/challenge').send({}).expect(422)
  })

  it('returns 415 for non-JSON content type', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/app-attestation/challenge')
      .set('Content-Type', 'text/plain')
      .send('not json')
      .expect(415)
  })

  it('returns a coded 403 without issuing a challenge when App Attest is not enabled', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: false })
    const req = createRequest()

    const res = await req
      .post('/api/v1/app-attestation/challenge')
      .send({ type: 'attestation' })
      .expect(403)

    expect(res.body.code).toBe('BYPASS_DISABLED')
  })
})
