import { describe, expect, it, vi } from 'vitest'
import * as jose from 'jose'
import { v4 as uuidv4, v7 as uuidv7, validate as uuidValidate, version as uuidVersion } from 'uuid'
import {
  encodeJwkSetForEnv,
  verifySessionJwt,
  verifyDeviceJwt,
  ensureAnonymousSession,
} from '../index.mts'

async function generatePrivateJwk(kid: string): Promise<jose.JWK> {
  const { privateKey } = await jose.generateKeyPair('RS512', { extractable: true })
  const jwk = await jose.exportJWK(privateKey)
  return { ...jwk, alg: 'RS512', kid, use: 'sig' }
}

describe('ensureAnonymousSession', () => {
  it('mints fresh dt and st when no cookies', async () => {
    const result = await ensureAnonymousSession({})
    expect(result.mintedDt).toBe(true)
    expect(result.mintedSt).toBe(true)
    expect(typeof result.dt).toBe('string')
    expect(typeof result.st).toBe('string')
    expect(typeof result.did).toBe('string')
    expect(typeof result.sid).toBe('string')
    expect(result.session.uid).toBeNull()
  })

  it('minted tokens verify correctly', async () => {
    const result = await ensureAnonymousSession({})
    const device = await verifyDeviceJwt(result.dt)
    const session = await verifySessionJwt(result.st)
    expect(device?.did).toBe(result.did)
    expect(session?.did).toBe(result.did)
    expect(session?.sid).toBe(result.sid)
    expect(session?.uid).toBeNull()
  })

  it('reuses existing valid dt and mints new st when st is absent', async () => {
    const first = await ensureAnonymousSession({})
    const second = await ensureAnonymousSession({ deviceToken: first.dt })
    expect(second.mintedDt).toBe(false)
    expect(second.mintedSt).toBe(true)
    expect(second.did).toBe(first.did)
    expect(second.dt).toBe(first.dt)
    expect(second.sid).not.toBe(first.sid)
  })

  it('rotates legacy dt-only device ids before minting anonymous st', async () => {
    const key = await generatePrivateJwk('legacy-dt-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const legacyDid = uuidv4()
    const dt = await new jose.SignJWT({ did: legacyDid })
      .setProtectedHeader({ alg: 'RS512', kid: key.kid })
      .setIssuedAt()
      .setIssuer('voucha.ai')
      .setAudience('voucha:device')
      .setExpirationTime('30 days')
      .sign((await jose.importJWK(key, 'RS512')) as jose.CryptoKey)

    const result = await ensureAnonymousSession({ deviceToken: dt, env, mode: 'production' })

    expect(result.mintedDt).toBe(true)
    expect(result.mintedSt).toBe(true)
    expect(uuidVersion(result.did)).toBe(7)
    expect(result.did).not.toBe(legacyDid)
    expect(result.dt).not.toBe(dt)
    await expect(verifySessionJwt(result.st, { env, mode: 'production' })).resolves.toMatchObject({
      did: result.did,
      sid: result.sid,
      uid: null,
    })
  })

  it('reuses existing valid anon dt and st when both are valid', async () => {
    const first = await ensureAnonymousSession({})
    const second = await ensureAnonymousSession({ deviceToken: first.dt, sessionToken: first.st })
    expect(second.mintedDt).toBe(false)
    expect(second.mintedSt).toBe(false)
    expect(second.dt).toBe(first.dt)
    expect(second.st).toBe(first.st)
    expect(second.did).toBe(first.did)
    expect(second.sid).toBe(first.sid)
  })

  it('mints new st when existing st belongs to different did', async () => {
    const first = await ensureAnonymousSession({})
    const other = await ensureAnonymousSession({}) // different did
    // Give other's st but first's dt — did mismatch on st
    const result = await ensureAnonymousSession({ deviceToken: first.dt, sessionToken: other.st })
    expect(result.mintedSt).toBe(true)
    expect(result.did).toBe(first.did)
  })

  it('anonymous payload omits uid, rol, mpl, tt, rca, sca', async () => {
    const result = await ensureAnonymousSession({})
    expect(result.session.uid).toBeNull()
    expect(result.session.rol).toBeUndefined()
    expect(result.session.mpl).toBeUndefined()
    expect(result.session.tt).toBeUndefined()
    expect(result.session.rca).toBeUndefined()
    expect(result.session.sca).toBeUndefined()
  })

  it('uses configured signing keys when env is provided', async () => {
    const key = await generatePrivateJwk('test-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const result = await ensureAnonymousSession({ env, mode: 'production' })
    const session = await verifySessionJwt(result.st, { env, mode: 'production' })
    expect(session?.uid).toBeNull()
    expect(session?.did).toBe(result.did)
  })

  it('ignores authenticated st (uid non-null) and mints fresh anon st', async () => {
    const key = await generatePrivateJwk('test-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }

    // Mint a device + authenticated session manually
    const { signDeviceJwt: sign, signSessionJwt: signSession } = await import('../jwt.mts')
    const { DEVICE_EXPIRATION_STRING, SESSION_EXPIRATION_STRING } = await import('../constants.mts')
    const did = uuidv7()
    const dt = await sign({ did }, { env, mode: 'production', expiresIn: DEVICE_EXPIRATION_STRING })
    const authSt = await signSession(
      { did, sid: uuidv7(), uid: uuidv7() },
      { env, mode: 'production', expiresIn: SESSION_EXPIRATION_STRING },
    )

    const result = await ensureAnonymousSession({
      deviceToken: dt,
      sessionToken: authSt,
      env,
      mode: 'production',
    })
    expect(result.mintedSt).toBe(true)
    expect(result.session.uid).toBeNull()
    expect(result.did).toBe(did)
  })

  it('mints UUIDv7 anon ids when crypto.randomUUID is unavailable', async () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto.randomUUID should not be called')
    })
    try {
      const result = await ensureAnonymousSession({})

      expect(result.mintedDt).toBe(true)
      expect(result.mintedSt).toBe(true)
      expect(uuidValidate(result.did)).toBe(true)
      expect(uuidVersion(result.did)).toBe(7)
      expect(uuidValidate(result.sid)).toBe(true)
      expect(uuidVersion(result.sid)).toBe(7)
    } finally {
      randomUUID.mockRestore()
    }
  })

  it('mints a 30-day st when the incoming dt carries dc:attested', async () => {
    const key = await generatePrivateJwk('attested-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const { signDeviceJwt: sign } = await import('../jwt.mts')
    const { DEVICE_EXPIRATION_STRING } = await import('../constants.mts')
    const did = uuidv7()
    const dt = await sign(
      { did, dc: 'attested' },
      { env, mode: 'production', expiresIn: DEVICE_EXPIRATION_STRING },
    )

    const result = await ensureAnonymousSession({ deviceToken: dt, env, mode: 'production' })
    expect(result.mintedSt).toBe(true)

    const session = await verifySessionJwt(result.st, { env, mode: 'production' })
    const lifetimeSeconds = session!.exp! - session!.iat!
    expect(lifetimeSeconds).toBe(30 * 24 * 60 * 60)
  })

  it('mints a 2-day st when the incoming dt has no dc claim', async () => {
    const result = await ensureAnonymousSession({})
    const session = await verifySessionJwt(result.st)
    const lifetimeSeconds = session!.exp! - session!.iat!
    expect(lifetimeSeconds).toBe(2 * 24 * 60 * 60)
  })
})
