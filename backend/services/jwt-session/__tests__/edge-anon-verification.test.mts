import { describe, expect, it, vi } from 'vitest'
import * as jose from 'jose'
import { EDGE_ANON_SESSION_JWT_ISSUER, signDeviceJwt, signSessionJwt } from '@ts-shared/session-jwt'
import { encodeJwkSet as encodeJwkSetForEnv } from '@vouchington/session-jwt'
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
    vi.stubEnv('VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64', undefined)
    vi.stubEnv('VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64', undefined)
    vi.stubEnv('VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64', encodeJwkSetForEnv([legacyKey]))

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
      vi.unstubAllEnvs()
    }
  })
})
