import {
  withBlockedAppAttestationInsert,
  getActiveTestSessionId,
  createTestAttestationProof,
} from '@voucha/test-helpers/app-attestation-session'
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { v7 } from 'uuid'
import { createTestUserDirect, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { readSessionDeviceAuthority } from '@services/jwt-session/device-authority'
import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'
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
  refreshSessionState,
  verifyDeviceAndSessionTokens,
} from '@services/jwt-session'
import { decodeSessionJwt } from '@ts-shared/session-jwt'
import { mintNativeSessionMcpToken } from '@services/oauth-authorization-server'

const verifyAttestationMock = vi.hoisted(() =>
  vi.fn<typeof import('node-app-attest').verifyAttestation>(),
)

vi.mock<typeof import('node-app-attest')>(import('node-app-attest'), async importOriginal => ({
  ...(await importOriginal()),
  verifyAttestation: verifyAttestationMock,
}))

function cookieValueOf(cookieHeader: string[] | undefined, name: string): string | undefined {
  const cookie = cookieHeader?.findLast(value => value.startsWith(`${name}=`))
  return cookie?.split(';')[0]?.slice(name.length + 1)
}

function expiresAtOf(cookieHeader: string[] | undefined, name: string): number | undefined {
  const cookie = cookieHeader?.findLast(value => value.startsWith(`${name}=`))
  const match = cookie?.match(/Expires=([^;]+)/)
  return match ? Date.parse(match[1]!) : undefined
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
    const { id: uid } = await createTestUserDirect()
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
    const deviceToken = cookieValueOf(cookieHeader, 'dt')
    const sessionToken = cookieValueOf(cookieHeader, 'st')
    expect(expiresAtOf(cookieHeader, 'st')).toBe(
      (decodeSessionJwt(sessionToken ?? '')?.exp ?? 0) * 1000,
    )
    const verified =
      deviceToken && sessionToken
        ? await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
        : false
    expect(verified).toMatchObject({ did, uid: null, dc: 'attested' })
    expect(verified).not.toMatchObject({ sid })
  })
  it('does not rotate device authority before a failed proof and still permits normal renewal', async () => {
    const user = await createTestUserDirect()
    const userAgent = 'Synthetic browser/1.0'
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: { user_agent: userAgent },
    })
    const before = await readSessionDeviceAuthority(tokens.sessionToken.payload.sid)
    verifyAttestationMock.mockImplementation(() => {
      throw new Error('Invalid external attestation')
    })
    const challengeId = randomUUID()
    await storeAppAttestChallenge('attestation', challengeId, randomBytes(32).toString('base64url'))
    await createRequest()
      .post('/api/v1/app-attestation/attest')
      .set('Cookie', `dt=${tokens.deviceToken.token}; st=${tokens.sessionToken.token}`)
      .set('User-Agent', userAgent)
      .send({
        keyId: randomBytes(32).toString('base64'),
        attestation: Buffer.from('invalid-proof').toString('base64'),
        challengeId,
      })
      .expect(401)
    const after = await readSessionDeviceAuthority(tokens.sessionToken.payload.sid)
    expect(after).toMatchObject({
      device_token_digest: before!.device_token_digest,
      device_token_issued_at: before!.device_token_issued_at,
      expires_at: before!.expires_at,
      device_token_binding: before!.device_token_binding,
    })
    const refreshed = await refreshSessionState({
      deviceToken: tokens.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.uid).toBe(user.id)
  })

  it.each(['web', 'native'] as const)(
    'preserves %s authentication origin when hardware proof replaces the session',
    async authOrigin => {
      const user = await createTestUserDirect()
      const tokens = await createDeviceAndSessionTokens({
        did: v7(),
        uid: user.id,
        authOrigin,
      })
      const proof = createTestAttestationProof()
      verifyAttestationMock.mockReturnValue(proof.result)
      const challengeId = randomUUID()
      await storeAppAttestChallenge(
        'attestation',
        challengeId,
        randomBytes(32).toString('base64url'),
      )
      const response = await createRequest()
        .post('/api/v1/app-attestation/attest')
        .set('Cookie', `dt=${tokens.deviceToken.token}; st=${tokens.sessionToken.token}`)
        .send({
          keyId: proof.result.keyId,
          attestation: Buffer.from('verified-proof').toString('base64'),
          challengeId,
        })
        .expect(200)
      const cookies = response.headers['set-cookie'] as unknown as string[]
      const verified = await verifyDeviceAndSessionTokens({
        deviceToken: cookieValueOf(cookies, 'dt')!,
        sessionToken: cookieValueOf(cookies, 'st')!,
      })
      expect(verified).toMatchObject({
        uid: user.id,
        did: tokens.deviceToken.payload.did,
        dc: 'attested',
        client: 'native',
      })
      expect(verified).not.toMatchObject({ sid: tokens.sessionToken.payload.sid })
      if (!verified) throw new Error('Verified attestation did not create a session')
      expect((await readSessionDeviceAuthority(verified.sid))?.authentication_origin).toBe(
        authOrigin,
      )
      const mint = mintNativeSessionMcpToken(user.id, {
        did: verified.did,
        sid: verified.sid,
        clientApp: 'ios',
        attestationStatus: 'attested',
      })
      const mintResult = await mint.then(
        value => ({ allowed: true, tokenType: value.token_type, code: null }),
        (err: { code?: string }) => ({ allowed: false, tokenType: null, code: err.code }),
      )
      expect(mintResult).toEqual(
        authOrigin === 'native'
          ? { allowed: true, tokenType: 'Bearer', code: null }
          : { allowed: false, tokenType: null, code: 'NATIVE_MCP_MINT_DENIED' },
      )
      expect(
        (await readSessionDeviceAuthority(tokens.sessionToken.payload.sid))!.revoked_at,
      ).toBeInstanceOf(Date)
    },
  )

  it('does not resurrect a signed-in session when logout wins during hardware verification', async () => {
    const user = await createTestUserDirect()
    const userAgent = 'Synthetic browser/1.0'
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: { user_agent: userAgent },
    })
    const proof = createTestAttestationProof()
    const keyId = proof.keyId
    let verificationReached: () => void = () => {
      throw new Error('Verification signal not initialized')
    }
    const verified = new Promise<void>(resolve => {
      verificationReached = resolve
    })
    verifyAttestationMock.mockImplementation(() => {
      verificationReached()
      return proof.result
    })
    const challengeId = randomUUID()
    await storeAppAttestChallenge('attestation', challengeId, randomBytes(32).toString('base64url'))
    await withBlockedAppAttestationInsert(
      {
        keyId,
        did: tokens.deviceToken.payload.did,
        publicKey: proof.publicKey,
        bundleId: TEST_APP_ATTEST_BUNDLE_ID,
      },
      async release => {
        const response = createRequest()
          .post('/api/v1/app-attestation/attest')
          .set('Cookie', `dt=${tokens.deviceToken.token}; st=${tokens.sessionToken.token}`)
          .set('User-Agent', userAgent)
          .send({
            keyId: keyId.toString('base64'),
            attestation: Buffer.from('verified-proof').toString('base64'),
            challengeId,
          })
          .then(result => result)
        await Promise.race([
          verified,
          response.then(() => {
            throw new Error('Attestation request finished before verification barrier')
          }),
        ])
        await revokeSession(tokens.sessionToken.payload.sid)
        await release()
        expect((await response).status).toBe(401)
      },
    )
    expect(
      (await readSessionDeviceAuthority(tokens.sessionToken.payload.sid))!.revoked_at,
    ).toBeInstanceOf(Date)
    await expect(getActiveTestSessionId(user.id)).resolves.toBeNull()
  })
})
