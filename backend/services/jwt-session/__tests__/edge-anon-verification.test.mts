import { describe, expect, it } from 'vitest'
import * as jose from 'jose'
import {
  EDGE_ANON_SESSION_JWT_ISSUER,
  encodeJwkSetForEnv,
  signDeviceJwt,
  signSessionJwt,
} from '@ts-shared/session-jwt'
import { v7 } from 'uuid'
import { verifyDeviceAndSessionTokens } from '../index.mts'

async function generatePrivateJwk(kid: string): Promise<jose.JWK> {
  const { privateKey } = await jose.generateKeyPair('RS512', { extractable: true })
  const jwk = await jose.exportJWK(privateKey)
  return { ...jwk, alg: 'RS512', kid, use: 'sig' }
}

describe('edge-anon verification', () => {
  it('verifyDeviceAndSessionTokens rejects non-anonymous edge-anon sessions when public keys are missing', async () => {
    const did = v7()
    const sid = v7()
    const uid = v7()
    const legacyKey = await generatePrivateJwk('legacy-key')
    const previousEdgePublicKeys = process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
    const previousPublicKeys = process.env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64
    const previousPrivateKeys = process.env.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64
    delete process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
    delete process.env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64
    process.env.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64 = encodeJwkSetForEnv([legacyKey])

    try {
      const deviceToken = await signDeviceJwt(
        { did },
        {
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'production',
          expiresIn: '30 days',
        },
      )
      const forgedUserSessionToken = await signSessionJwt(
        { did, sid, uid },
        {
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'production',
          expiresIn: '2 days',
        },
      )

      await expect(
        verifyDeviceAndSessionTokens({ deviceToken, sessionToken: forgedUserSessionToken }),
      ).resolves.toBe(false)
    } finally {
      restoreEnv('VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64', previousEdgePublicKeys)
      restoreEnv('VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64', previousPublicKeys)
      restoreEnv('VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64', previousPrivateKeys)
    }
  })
})

function restoreEnv(key: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = previousValue
}
