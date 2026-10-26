import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'
import { createDbscTestSession } from '@voucha/test-helpers/dbsc-session'

const origin = 'https://dbsc.example'

describe('DBSC route rate limit', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_ORIGIN', origin)
    vi.stubEnv('CF_WORKER_SECRET', 'synthetic-worker-secret-for-dbsc-rate-tests')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('does not make independent signed DBSC sessions share a NAT refresh budget', async () => {
    const sharedIp = nextTestRequestIp()
    for (let index = 0; index < 3; index++) {
      const fixture = await createDbscTestSession()
      const registered = await fixture.register()
      const request = createRequest()
        .set('x-forwarded-for', sharedIp)
        .set('User-Agent', fixture.base.userAgent)
        .set('Origin', origin)
        .set('x-forwarded-proto', 'https')
        .set('x-forwarded-host', 'dbsc.example')
      const url = '/api/v1/auth/device-bound-sessions/refreshes'
      const challenge = await request
        .post(url)
        .set('Cookie', `dt=${registered.dt}`)
        .set('Sec-Secure-Session-Id', registered.sid)
        .expect(403)
      const nonce = /^"([A-Za-z0-9_-]+)"/u.exec(challenge.headers['secure-session-challenge'])?.[1]
      expect(nonce).toBeDefined()
      await request
        .post(url)
        .set('Cookie', `dt=${registered.dt}`)
        .set('Sec-Secure-Session-Id', registered.sid)
        .set('Secure-Session-Response', await fixture.sign(nonce!))
        .expect(200)
    }
  })
})
