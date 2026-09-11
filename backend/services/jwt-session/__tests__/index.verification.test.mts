import { it, expect, describe } from 'vitest'
import { createDeviceAndSessionTokens, verifyDeviceAndSessionTokens } from '../index.mts'
import * as jose from 'jose'
import {
  EDGE_ANON_SESSION_JWT_ISSUER,
  derivePublicJwk,
  encodeJwkSetForEnv,
  signDeviceJwt,
  signSessionJwt,
} from '@ts-shared/session-jwt'
import { v7 } from 'uuid'

describe('index.verification', () => {
  async function generatePrivateJwk(kid: string): Promise<jose.JWK> {
    const { privateKey } = await jose.generateKeyPair('RS512', { extractable: true })
    const jwk = await jose.exportJWK(privateKey)
    return { ...jwk, alg: 'RS512', kid, use: 'sig' }
  }

  it('verifyDeviceAndSessionTokens rejects invalid tokens', async () => {
    await expect(
      verifyDeviceAndSessionTokens({
        deviceToken: 'invalid-token',
        sessionToken: 'invalid-token',
      }),
    ).resolves.toBe(false)
  })

  it('verifyDeviceAndSessionTokens returns false for invalid token format', async () => {
    await expect(
      verifyDeviceAndSessionTokens({
        deviceToken: 'not-a-token',
        sessionToken: 'not-a-token',
      }),
    ).resolves.toBe(false)
  })

  it('verifyDeviceAndSessionTokens returns false for malformed JWT structure', async () => {
    await expect(
      verifyDeviceAndSessionTokens({
        deviceToken: 'abc.def',
        sessionToken: 'abc.def',
      }),
    ).resolves.toBe(false)
  })

  it('verifyDeviceAndSessionTokens returns false for expired tokens', async () => {
    const did = v7()
    const sid = v7()
    const expiresAt = Math.floor(Date.now() / 1000) - 10
    const deviceToken = await signDeviceJwt({ did }, { expiresIn: expiresAt })
    const sessionToken = await signSessionJwt({ did, sid, uid: null }, { expiresIn: expiresAt })

    await expect(verifyDeviceAndSessionTokens({ deviceToken, sessionToken })).resolves.toBe(false)
  })

  it('verifyDeviceAndSessionTokens returns false for tokens signed with wrong key', async () => {
    const did = v7()
    const sid = v7()
    const { privateKey: otherPrivateKey } = await jose.generateKeyPair('RS512')
    const deviceToken = await new jose.SignJWT({ did })
      .setProtectedHeader({ alg: 'RS512' })
      .setIssuedAt()
      .setIssuer('voucha.ai')
      .setExpirationTime('1 year')
      .sign(otherPrivateKey)
    const sessionToken = await new jose.SignJWT({ did, sid, uid: null })
      .setProtectedHeader({ alg: 'RS512' })
      .setIssuedAt()
      .setIssuer('voucha.ai')
      .setExpirationTime('2 days')
      .sign(otherPrivateKey)

    await expect(verifyDeviceAndSessionTokens({ deviceToken, sessionToken })).resolves.toBe(false)
  })

  it('verifyDeviceAndSessionTokens returns false for mismatched device ids', async () => {
    const did1 = v7()
    const did2 = v7()
    const result = await createDeviceAndSessionTokens({ did: did1 })
    const result2 = await createDeviceAndSessionTokens({ did: did2 })

    // Mix device token from did1 with session token from did2
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result2.sessionToken.token,
    })
    expect(verified).toBe(false)
  })

  it('verifyDeviceAndSessionTokens allows null uid', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did, uid: null })

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    expect((verified as Exclude<typeof verified, false>).uid).toBeNull()
  })

  it('verifyDeviceAndSessionTokens allows edge-signed anonymous sessions only', async () => {
    const did = v7()
    const sid = v7()
    const uid = v7()
    const edgeKey = await generatePrivateJwk('edge-anon-key')
    const privateEnv = {
      VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([edgeKey]),
    }
    const previousPublicKeys = process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
    process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64 = encodeJwkSetForEnv([
      derivePublicJwk(edgeKey),
    ])

    try {
      const deviceToken = await signDeviceJwt(
        { did },
        {
          env: privateEnv,
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'production',
          expiresIn: '30 days',
        },
      )
      const anonSessionToken = await signSessionJwt(
        { did, sid, uid: null },
        {
          env: privateEnv,
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'production',
          expiresIn: '2 days',
        },
      )
      const forgedUserSessionToken = await signSessionJwt(
        { did, sid, uid },
        {
          env: privateEnv,
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'production',
          expiresIn: '2 days',
        },
      )

      await expect(
        verifyDeviceAndSessionTokens({ deviceToken, sessionToken: anonSessionToken }),
      ).resolves.toMatchObject({ did, sid, uid: null })
      await expect(
        verifyDeviceAndSessionTokens({ deviceToken, sessionToken: forgedUserSessionToken }),
      ).resolves.toBe(false)
    } finally {
      if (previousPublicKeys === undefined) {
        delete process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
      } else {
        process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64 = previousPublicKeys
      }
    }
  })

  it('verifyDeviceAndSessionTokens preserves non-production edge-anon fallback keys', async () => {
    const did = v7()
    const sid = v7()
    const previousEdgePublicKeys = process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
    const previousPublicKeys = process.env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64
    delete process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
    delete process.env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64

    try {
      const deviceToken = await signDeviceJwt(
        { did },
        {
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'test',
          expiresIn: '30 days',
        },
      )
      const sessionToken = await signSessionJwt(
        { did, sid, uid: null },
        {
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'test',
          expiresIn: '2 days',
        },
      )

      await expect(
        verifyDeviceAndSessionTokens({ deviceToken, sessionToken }),
      ).resolves.toMatchObject({ did, sid, uid: null })
    } finally {
      if (previousEdgePublicKeys === undefined) {
        delete process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
      } else {
        process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64 = previousEdgePublicKeys
      }
      if (previousPublicKeys === undefined) {
        delete process.env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64
      } else {
        process.env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64 = previousPublicKeys
      }
    }
  })

  it('verifyDeviceAndSessionTokens returns enrichment fields when present', async () => {
    const did = v7()
    const uid = v7()
    const roles = ['administrator']
    const result = await createDeviceAndSessionTokens({
      did,
      uid,
      roles,
      membershipPlan: 'pro',
      trustTier: 5,
      uiLocale: 'fr',
    })

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    const v = verified as Exclude<typeof verified, false>
    expect(v.uid).toBe(uid)
    expect(v.rol).toEqual(roles)
    expect(v.mpl).toBe('pro')
    expect(v.tt).toBe(5)
    expect(v.uil).toBe('fr')
    expect(typeof v.rca).toBe('number')
    expect(typeof v.sca).toBe('number')
  })

  it('verifyDeviceAndSessionTokens preserves a null UI locale claim', async () => {
    const did = v7()
    const sid = v7()
    const uid = v7()
    const deviceToken = await signDeviceJwt({ did }, { expiresIn: '30 days' })
    const sessionToken = await signSessionJwt({ did, sid, uid, uil: null }, { expiresIn: '2 days' })

    const verified = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })

    expect(verified).not.toBe(false)
    expect((verified as Exclude<typeof verified, false>).uil).toBeNull()
  })

  it('verifyDeviceAndSessionTokens surfaces dc:attested from the device token', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did, deviceClass: 'attested' })

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    expect((verified as Exclude<typeof verified, false>).dc).toBe('attested')
  })

  it('verifyDeviceAndSessionTokens omits dc when the device token has no dc claim', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did })

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    expect((verified as Exclude<typeof verified, false>).dc).toBeUndefined()
  })
})
