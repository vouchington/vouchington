import * as jose from 'jose'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { getOptionalRequestClientInfo } from '@modules/request-client-info'
import { EDGE_ANON_SESSION_JWT_ISSUER, signDeviceJwt, signSessionJwt } from '@ts-shared/session-jwt'
import { derivePublicJwk, encodeJwkSet as encodeJwkSetForEnv } from '@vouchington/session-jwt'
import { v7 } from 'uuid'
import { createApiRequestGuardedListener } from './app.mts'

const listener = createApiRequestGuardedListener((_req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(getOptionalRequestClientInfo() ?? null))
})

const clientHeaders = {
  'x-voucha-client': 'web',
  'x-voucha-platform': 'web',
  'x-voucha-app-version': 'test',
  'cf-connecting-ip': '203.0.113.2',
}

async function deviceIdForCookie(cookie: string): Promise<string | null> {
  const response = await request(listener)
    .get('/api/v1/posts')
    .set(clientHeaders)
    .set('cookie', cookie)
  expect(response.status).toBe(200)
  const body = response.body as { deviceId?: string } | null
  return body?.deviceId ?? null
}

async function generatePrivateJwk(kid: string): Promise<jose.JWK> {
  const { privateKey } = await jose.generateKeyPair('RS512', { extractable: true })
  const jwk = await jose.exportJWK(privateKey)
  return { ...jwk, alg: 'RS512', kid, use: 'sig' }
}

describe('request device identity verification', () => {
  it('uses the paired device id when the session token verifies', async () => {
    const did = v7()
    const edgeKey = await generatePrivateJwk('edge-anon-key')
    const privateEnv = {
      VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([edgeKey]),
    }
    const previousPublicKeys = process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
    vi.stubEnv(
      'VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64',
      encodeJwkSetForEnv([derivePublicJwk(edgeKey)]),
    )

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
      const sessionToken = await signSessionJwt(
        { did, sid: v7(), uid: null },
        {
          env: privateEnv,
          issuer: EDGE_ANON_SESSION_JWT_ISSUER,
          mode: 'production',
          expiresIn: '2 days',
        },
      )

      await expect(deviceIdForCookie(`dt=${deviceToken}; st=${sessionToken}`)).resolves.toBe(did)
      await expect(deviceIdForCookie(`dt=${deviceToken}; st=stale-st`)).resolves.toBeNull()
    } finally {
      vi.stubEnv('VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64', previousPublicKeys)
    }
  })

  it('keeps the device id when the session token is stale', async () => {
    const did = v7()
    const deviceToken = await signDeviceJwt({ did }, { expiresIn: '30 days' })

    await expect(deviceIdForCookie(`dt=${deviceToken}; st=stale-st`)).resolves.toBe(did)
  })

  it('returns no device id when neither cookie verifies', async () => {
    await expect(deviceIdForCookie('dt=not-a-device-token')).resolves.toBeNull()
  })
})
