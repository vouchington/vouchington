import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'
import { createDbscTestSession } from '@voucha/test-helpers/dbsc-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { useRouteRateLimitConfigSnapshot } from '@voucha/test-helpers/api/route-rate-limit-config-snapshot'

const origin = 'https://dbsc.example'

describe('DBSC route rate limit', () => {
  useRouteRateLimitConfigSnapshot()
  beforeEach(() => {
    vi.stubEnv('SITE_ORIGIN', origin)
    vi.stubEnv('CF_WORKER_SECRET', 'synthetic-worker-secret-for-dbsc-rate-tests')
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_sensitive: 5,
      anon_sensitive_ttl: 60,
    })
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

  it('still caps repeated requests from one signed device session', async () => {
    const fixture = await createDbscTestSession()
    const registered = await fixture.register()
    const request = createRequest()
      .set('x-forwarded-for', nextTestRequestIp())
      .set('User-Agent', fixture.base.userAgent)
      .set('Origin', origin)
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'dbsc.example')
    const url = '/api/v1/auth/device-bound-sessions/refreshes'
    for (let index = 0; index < 4; index++)
      await request
        .post(url)
        .set('Cookie', `dt=${registered.dt}`)
        .set('Sec-Secure-Session-Id', registered.sid)
        .expect(403)
    await request
      .post(url)
      .set('Cookie', `dt=${registered.dt}`)
      .set('Sec-Secure-Session-Id', registered.sid)
      .expect(429)
  })

  it('retains the shared IP cap for unsigned device credentials', async () => {
    const request = createRequest()
      .set('x-forwarded-for', nextTestRequestIp())
      .set('Origin', origin)
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'dbsc.example')
    const url = '/api/v1/auth/device-bound-sessions/refreshes'
    for (let index = 0; index < 4; index++)
      await request.post(url).set('Cookie', 'dt=unsigned').expect(400)
    await request.post(url).set('Cookie', 'dt=unsigned').expect(429)
  })
})
