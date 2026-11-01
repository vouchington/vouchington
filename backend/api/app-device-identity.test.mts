import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { signDeviceJwt, signSessionJwt } from '@ts-shared/session-jwt'
import { v7 } from 'uuid'
import { getOptionalRequestClientInfo } from '@modules/request-client-info'
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

describe('request device identity verification', () => {
  it('uses the paired device id when the session token verifies', async () => {
    const did = v7()
    const deviceToken = await signDeviceJwt({ did }, { expiresIn: '30 days' })
    const sessionToken = await signSessionJwt(
      { did, sid: v7(), uid: null },
      { expiresIn: '2 days' },
    )

    await expect(deviceIdForCookie(`dt=${deviceToken}; st=${sessionToken}`)).resolves.toBe(did)
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
