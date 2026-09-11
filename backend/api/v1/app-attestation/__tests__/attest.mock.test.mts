import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { createRequest, nextTestRequestIp } from '@voucha/api/test-helpers/server'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import {
  TEST_APP_ATTEST_BUNDLE_ID,
  TEST_APP_ATTEST_TEAM_ID,
} from '@voucha/test-helpers/app-attestation'
import { appAttestationConfig, storeAppAttestChallenge } from '@services/app-attestation'
import { loadAttestationKeyByKeyId } from '@services/app-attestation/store'
import {
  createDeviceAndSessionTokens,
  revokeSession,
  verifyDeviceAndSessionTokens,
} from '@services/jwt-session'
import { ATTESTED_SESSION_EXPIRATION_SECONDS } from '@ts-shared/session-jwt'

const verifyAttestationMock = vi.hoisted(() =>
  vi.fn<typeof import('node-app-attest').verifyAttestation>(),
)

vi.mock<typeof import('node-app-attest')>(import('node-app-attest'), async importOriginal => ({
  ...(await importOriginal()),
  verifyAttestation: verifyAttestationMock,
}))

function cookieValueOf(cookieHeader: string[] | undefined, name: string): string | undefined {
  const cookie = cookieHeader?.find(value => value.startsWith(`${name}=`))
  return cookie?.split(';')[0]?.slice(name.length + 1)
}

function maxAgeOf(cookieHeader: string[] | undefined, name: string): number | undefined {
  const cookie = cookieHeader?.find(value => value.startsWith(`${name}=`))
  const match = cookie?.match(/Max-Age=(\d+)/)
  return match ? Number(match[1]) : undefined
}

describe('POST /api/v1/app-attestation/attest', () => {
  beforeEach(() => {
    verifyAttestationMock.mockReset()
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEST_APP_ATTEST_TEAM_ID)
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', TEST_APP_ATTEST_BUNDLE_ID)
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    deleteDynamicConfigFieldsForTest(
      appAttestationConfig,
      Object.keys(appAttestationConfig.fieldTypes),
    )
  })

  it('rotates a revoked hot authenticated session before minting attested cookies', async () => {
    const keyId = randomBytes(32).toString('base64')
    const publicKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({
      type: 'spki',
      format: 'pem',
    })
    verifyAttestationMock.mockReturnValue({
      keyId,
      publicKey,
      receipt: Buffer.alloc(0),
      environment: 'production',
    })

    const did = v7()
    const sid = v7()
    const uid = v7()
    const tokens = await createDeviceAndSessionTokens({ did, sid, uid })
    expect(tokens.sessionToken.payload.sca).toBeGreaterThan(Math.floor(Date.now() / 1000))
    await revokeSession(sid)

    const challengeId = randomUUID()
    await storeAppAttestChallenge('attestation', challengeId, randomBytes(32).toString('base64url'))

    const response = await createRequest()
      .post('/api/v1/app-attestation/attest')
      .set('x-forwarded-for', nextTestRequestIp())
      .set('Cookie', `dt=${tokens.deviceToken.token}; st=${tokens.sessionToken.token}`)
      .send({
        keyId,
        attestation: Buffer.from('external-provider-boundary').toString('base64'),
        challengeId,
      })
      .expect(200)

    expect(response.body).toEqual({ environment: 'production' })
    expect(await loadAttestationKeyByKeyId(Buffer.from(keyId, 'base64'))).toMatchObject({
      did,
      bundle_id: TEST_APP_ATTEST_BUNDLE_ID,
      environment: 'production',
    })

    const cookieHeader = response.headers['set-cookie'] as unknown as string[] | undefined
    expect(maxAgeOf(cookieHeader, 'st')).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    const deviceToken = cookieValueOf(cookieHeader, 'dt')
    const sessionToken = cookieValueOf(cookieHeader, 'st')
    const verified =
      deviceToken && sessionToken
        ? await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
        : false
    expect(verified).toMatchObject({ did, uid: null, dc: 'attested' })
    expect(verified).not.toMatchObject({ sid })
  })
})
