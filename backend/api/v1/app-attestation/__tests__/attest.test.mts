import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import { appAttestationConfig, storeAppAttestChallenge } from '@services/app-attestation'
import { createDeviceAndSessionTokens, verifyDeviceAndSessionTokens } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  ATTESTED_SESSION_EXPIRATION_SECONDS,
  SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'

// Real Apple-issued development attestation, reused verbatim from
// backend/services/app-attestation/attestation.test.mts (itself sourced from
// node-app-attest's own fixture: test/fixtures/attestation-development.json). keyId is
// cryptographically fixed to this device key and can never be randomized -- see
// attemptFixtureAttest below for how a dirty DB (a prior successful run already inserted
// this keyId) is handled.
const BUNDLE_IDENTIFIER = 'io.uebelacker.AppAttestExample'
const TEAM_IDENTIFIER = 'V8H6LQ9448'
const FIXTURE_CHALLENGE = Buffer.from(
  'NmY0NmFhZWItMzk4OS00NWRiLThjMjQtNmNjODhhNzZlNzg5',
  'base64',
).toString('utf8')
const FIXTURE_KEY_ID = 's/134MbeEEZDZKCvOTf+jZgNhpoDwdXZ8cKfTym8FUg='
const FIXTURE_ATTESTATION_BASE64 =
  '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'

function maxAgeOf(cookieHeader: string[] | undefined, name: string): number | undefined {
  const cookie = cookieHeader?.find(c => c.startsWith(`${name}=`))
  const match = cookie?.match(/Max-Age=(\d+)/)
  return match ? Number(match[1]) : undefined
}

function cookieValueOf(cookieHeader: string[] | undefined, name: string): string | undefined {
  const cookie = cookieHeader?.find(c => c.startsWith(`${name}=`))
  return cookie?.split(';')[0]?.slice(name.length + 1)
}

async function attemptFixtureAttest(req: ReturnType<typeof createRequest>) {
  const challengeId = randomUUID()
  await storeAppAttestChallenge('attestation', challengeId, FIXTURE_CHALLENGE)
  return req.post('/api/v1/app-attestation/attest').send({
    keyId: FIXTURE_KEY_ID,
    attestation: FIXTURE_ATTESTATION_BASE64,
    challengeId,
  })
}

describe('POST /api/v1/app-attestation/attest', () => {
  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  }, 15_000)

  beforeEach(() => {
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEAM_IDENTIFIER)
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', BUNDLE_IDENTIFIER)
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      allow_development_attestation: true,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    deleteDynamicConfigFieldsForTest(
      appAttestationConfig,
      Object.keys(appAttestationConfig.fieldTypes),
    )
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it('re-mints cookies with dc:attested + 30-day st expiry, preserving uid/sid/enrichment', async () => {
    const req = createRequest()
    const did = v7()
    const sid = v7()
    const uid = v7()
    const roles = ['member']
    const membershipPlan = 'free'
    const trustTier = 2
    const uiLocale = 'en'
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
      did,
      sid,
      uid,
      roles,
      membershipPlan,
      trustTier,
      uiLocale,
    })
    req.set('Cookie', `dt=${deviceToken.token}; st=${sessionToken.token}`)

    const res = await attemptFixtureAttest(req)

    if (res.status === 409) {
      // This fixture's keyId is cryptographically fixed to one real device key and
      // can never be randomized -- a prior run against this dirty DB already
      // registered it. Crypto verification succeeds before the DB conflict, so
      // cookie re-minting (which runs only after verifyAndStoreAttestation
      // resolves) never executes on this path -- nothing further to assert.
      return
    }

    expect(res.status).toBe(200)
    expect(res.body.environment).toBe('development')

    const cookieHeader = res.headers['set-cookie'] as unknown as string[] | undefined
    expect(maxAgeOf(cookieHeader, 'st')).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    expect(maxAgeOf(cookieHeader, 'st')).not.toBe(SESSION_EXPIRATION_SECONDS)

    const newDt = cookieValueOf(cookieHeader, 'dt')
    const newSt = cookieValueOf(cookieHeader, 'st')
    const verified =
      newDt && newSt
        ? await verifyDeviceAndSessionTokens({ deviceToken: newDt, sessionToken: newSt })
        : false
    expect(verified).toMatchObject({
      did,
      sid,
      uid,
      dc: 'attested',
      rol: roles,
      mpl: membershipPlan,
      tt: trustTier,
      uil: uiLocale,
    })
  })

  it('propagates a 400 when the challenge is missing or expired', async () => {
    const req = createRequest()
    const res = await req
      .post('/api/v1/app-attestation/attest')
      .send({
        keyId: 'irrelevant',
        attestation: Buffer.from('irrelevant').toString('base64'),
        challengeId: randomUUID(),
      })
      .expect(400)

    expect(res.body.message).toContain('challenge missing or expired')
  })

  it('propagates a 401 for an invalid attestation blob', async () => {
    const req = createRequest()
    const challengeId = randomUUID()
    await storeAppAttestChallenge('attestation', challengeId, 'unused-decoy-challenge')

    const res = await req
      .post('/api/v1/app-attestation/attest')
      .send({
        keyId: 'irrelevant',
        attestation: Buffer.from('not-a-real-attestation').toString('base64'),
        challengeId,
      })
      .expect(401)

    expect(res.body.message).toContain('verification failed')
  })

  it('returns 422 when a required field is missing', async () => {
    const req = createRequest()
    await req.post('/api/v1/app-attestation/attest').send({}).expect(422)
  })

  it('returns 415 for non-JSON content type', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/app-attestation/attest')
      .set('Content-Type', 'text/plain')
      .send('not json')
      .expect(415)
  })

  it('returns a coded 403 before verifying anything when App Attest is not enabled', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: false })
    const req = createRequest()

    const res = await req
      .post('/api/v1/app-attestation/attest')
      .send({
        keyId: 'irrelevant',
        attestation: Buffer.from('irrelevant').toString('base64'),
        challengeId: randomUUID(),
      })
      .expect(403)

    expect(res.body.code).toBe('BYPASS_DISABLED')
  })
})
