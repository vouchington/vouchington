import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { serializeItem } from 'structured-headers'
import {
  createTestUserDirect,
  getTestPrivateUserById,
  softDeleteUser,
} from '@voucha/test-helpers/entities/users'
import { verifyDeviceJwt, verifySessionJwt, signSessionJwt } from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { createDeviceAndSessionTokens, refreshSessionState, revokeSession } from './index.mts'
import { authorizeDbscProof, getWebRefreshAuthority } from './dbsc-proof.mts'
import { createDbscRegistrationOffer, createDbscRefreshChallenge } from './dbsc-registration.mts'
import { getWebSessionAuthorityKey, getDbscChallengeKey } from './dbsc-state.mts'

const origin = 'https://dbsc.example'
const userAgent = 'Synthetic browser/1.0'

async function setupSession() {
  const user = await createTestUserDirect()
  const tokens = await createDeviceAndSessionTokens({
    did: v7(),
    uid: user.id,
    deviceContext: { user_agent: userAgent, origin },
  })
  const key = await generateKeyPair('ES256')
  const publicKey = await exportJWK(key.publicKey)
  const nonce = await createDbscRegistrationOffer({
    deviceToken: tokens.deviceToken.token,
    userAgent,
    origin,
  })
  expect(nonce).toBeTruthy()
  const proofOptions = {
    deviceToken: tokens.deviceToken.token,
    userAgent,
    origin,
    fetchUser: getTestPrivateUserById,
  }
  async function sign(nonceValue: string, registration = false) {
    return serializeItem(
      await new SignJWT({ jti: nonceValue })
        .setProtectedHeader({
          alg: 'ES256',
          typ: 'dbsc+jwt',
          ...(registration && { jwk: publicKey }),
        })
        .sign(key.privateKey),
    )
  }
  async function register() {
    return authorizeDbscProof({
      ...proofOptions,
      purpose: 'registration',
      proofHeader: await sign(nonce!, true),
    })
  }
  return { user, tokens, key, publicKey, nonce: nonce!, proofOptions, sign, register }
}

describe('DBSC session authority', () => {
  it('binds the initial credential-completion challenge once and preserves the original refresh lifetime', async () => {
    const fixture = await setupSession()
    const before = (await verifyDeviceJwt(fixture.tokens.deviceToken.token))!
    const proof = await fixture.register()
    const refreshed = await refreshSessionState({ ...fixture.proofOptions, dbscProof: proof })
    expect(refreshed.sid).toBe(fixture.tokens.sessionToken.payload.sid)
    expect((await verifySessionJwt(refreshed.st))?.dbsc).toBe(true)
    expect(refreshed.dt).toBe(fixture.tokens.deviceToken.token)
    const { authority } = await getWebRefreshAuthority(refreshed.dt, userAgent)
    expect(authority).toMatchObject({
      kind: 'bound',
      publicKey: fixture.publicKey,
      origin,
      deviceExpiresAt: before.exp,
      deviceIssuedAt: before.iat,
    })
    expect(await createDbscRegistrationOffer(fixture.proofOptions)).toBeNull()
    await expect(fixture.register()).rejects.toMatchObject({ code: 'DBSC_PROOF_INVALID' })
  })

  it('requires proof for older device cookies and every paired hot, warm and cold refresh', async () => {
    const fixture = await setupSession()
    await fixture.register()
    for (const freshness of [{}, { sca: 0 }, { sca: 0, rca: 0 }]) {
      const access = await signSessionJwt(
        { ...fixture.tokens.sessionToken.payload, ...freshness },
        { expiresIn: '10 minutes' },
      )
      await expect(
        refreshSessionState({ ...fixture.proofOptions, sessionToken: access }),
      ).rejects.toMatchObject({ code: 'DBSC_PROOF_REQUIRED' })
    }
    await expect(refreshSessionState(fixture.proofOptions)).rejects.toMatchObject({
      code: 'DBSC_PROOF_REQUIRED',
    })
    await expect(
      refreshSessionState({
        ...fixture.proofOptions,
        dbscProof: { sid: fixture.tokens.sessionToken.payload.sid },
      }),
    ).rejects.toMatchObject({ code: 'DBSC_PROOF_REQUIRED' })
  })

  it('consumes a refresh proof once, including concurrent attempts, and keeps current-user authority', async () => {
    const fixture = await setupSession()
    await fixture.register()
    const sid = fixture.tokens.sessionToken.payload.sid
    const nonce = (await createDbscRefreshChallenge({ ...fixture.proofOptions, sessionId: sid }))!
    const proofHeader = await fixture.sign(nonce)
    const results = await Promise.allSettled(
      [0, 1].map(() =>
        authorizeDbscProof({
          ...fixture.proofOptions,
          purpose: 'refresh',
          sessionHeader: serializeItem(sid),
          proofHeader,
        }),
      ),
    )
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const winner = results.find(result => result.status === 'fulfilled')!
    if (winner.status !== 'fulfilled') throw new Error('Expected one proof authorization')
    const refreshed = await refreshSessionState({
      ...fixture.proofOptions,
      dbscProof: winner.value,
    })
    expect(refreshed.uid).toBe(fixture.user.id)
    expect(refreshed.session).toMatchObject({ dbsc: true, client: 'web' })
  })

  it('rejects a registration proof for another origin and an expired initial challenge', async () => {
    const fixture = await setupSession()
    const proofHeader = await fixture.sign(fixture.nonce, true)
    await expect(
      authorizeDbscProof({
        ...fixture.proofOptions,
        origin: 'https://another.example',
        purpose: 'registration',
        proofHeader,
      }),
    ).rejects.toMatchObject({ code: 'DBSC_PROOF_INVALID' })
    await sessionValkeyClient.unlink([getDbscChallengeKey(fixture.nonce)])
    await expect(fixture.register()).rejects.toMatchObject({ code: 'DBSC_PROOF_INVALID' })
    expect(
      (await getWebRefreshAuthority(fixture.tokens.deviceToken.token, userAgent)).authority.kind,
    ).toBe('unbound')
  })

  it('rejects a wrong key and cross-session refresh proof without consuming the legitimate challenge', async () => {
    const [fixture, other] = await Promise.all([setupSession(), setupSession()])
    await fixture.register()
    const sid = fixture.tokens.sessionToken.payload.sid
    const nonce = (await createDbscRefreshChallenge({ ...fixture.proofOptions, sessionId: sid }))!
    await expect(
      authorizeDbscProof({
        ...fixture.proofOptions,
        purpose: 'refresh',
        sessionHeader: serializeItem(sid),
        proofHeader: await other.sign(nonce),
      }),
    ).rejects.toMatchObject({ code: 'DBSC_PROOF_INVALID' })
    await expect(
      authorizeDbscProof({
        ...fixture.proofOptions,
        purpose: 'refresh',
        sessionHeader: serializeItem(v7()),
        proofHeader: await fixture.sign(nonce),
      }),
    ).rejects.toMatchObject({ code: 'DBSC_PROOF_INVALID' })
    await expect(
      authorizeDbscProof({
        ...fixture.proofOptions,
        purpose: 'refresh',
        sessionHeader: serializeItem(sid),
        proofHeader: await fixture.sign(nonce),
      }),
    ).resolves.toMatchObject({ sid })
  })

  it('fails closed for lost authority and never recreates it during credential replay', async () => {
    const fixture = await setupSession()
    const sid = fixture.tokens.sessionToken.payload.sid
    await sessionValkeyClient.unlink([getWebSessionAuthorityKey(sid)])
    await expect(refreshSessionState(fixture.proofOptions)).rejects.toMatchObject({
      code: 'SESSION_RELOGIN_REQUIRED',
    })
    await expect(
      createDeviceAndSessionTokens({
        did: fixture.tokens.deviceToken.payload.did,
        sid,
        uid: fixture.user.id,
        credentialReplay: true,
        deviceContext: { user_agent: userAgent, origin },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    expect(await sessionValkeyClient.get(getWebSessionAuthorityKey(sid))).toBeNull()
  })

  it('preserves bound authority and original device epoch on secure credential completion replay', async () => {
    const fixture = await setupSession()
    await fixture.register()
    const before = (await verifyDeviceJwt(fixture.tokens.deviceToken.token))!
    const replay = await createDeviceAndSessionTokens({
      did: before.did,
      sid: before.refresh_sid,
      uid: fixture.user.id,
      credentialReplay: true,
      deviceContext: { user_agent: userAgent, origin, isNativeClient: true },
    })
    expect(replay.deviceToken.registrationEligible).toBe(false)
    expect(replay.sessionToken.payload.dbsc).toBe(true)
    expect(await verifyDeviceJwt(replay.deviceToken.token)).toMatchObject({
      exp: before.exp,
      iat: before.iat,
    })
    await expect(
      refreshSessionState({ ...fixture.proofOptions, deviceToken: replay.deviceToken.token }),
    ).rejects.toMatchObject({ code: 'DBSC_PROOF_REQUIRED' })
    await expect(
      createDeviceAndSessionTokens({
        did: before.did,
        sid: before.refresh_sid,
        uid: fixture.user.id,
        credentialReplay: true,
        deviceContext: { user_agent: userAgent, origin: 'https://other.example' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
  })

  it('rejects private registration keys and wrong JWT types without consuming the challenge', async () => {
    const fixture = await setupSession()
    const privateKey = { ...fixture.publicKey, d: 'synthetic-private-field' }
    for (const header of [
      { alg: 'ES256', typ: 'dbsc+jwt', jwk: privateKey },
      { alg: 'ES256', typ: 'JWT', jwk: fixture.publicKey },
    ]) {
      const proofHeader = serializeItem(
        await new SignJWT({ jti: fixture.nonce })
          .setProtectedHeader(header)
          .sign(fixture.key.privateKey),
      )
      await expect(
        authorizeDbscProof({ ...fixture.proofOptions, purpose: 'registration', proofHeader }),
      ).rejects.toMatchObject({ status: 400, code: 'DBSC_PROOF_INVALID' })
    }
    await expect(fixture.register()).resolves.toBeDefined()
  })

  it('cannot bind a deleted user or refresh a revoked bound session', async () => {
    const fixture = await setupSession()
    await softDeleteUser(fixture.user.id)
    await expect(fixture.register()).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    const bound = await setupSession()
    await bound.register()
    await revokeSession(bound.tokens.sessionToken.payload.sid)
    await expect(
      createDbscRefreshChallenge({
        ...bound.proofOptions,
        sessionId: bound.tokens.sessionToken.payload.sid,
      }),
    ).rejects.toMatchObject({ status: 401, code: 'SESSION_RELOGIN_REQUIRED' })
  })

  it('cannot bind a revoked session', async () => {
    const fixture = await setupSession()
    await revokeSession(fixture.tokens.sessionToken.payload.sid)
    await expect(fixture.register()).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
  })
})
