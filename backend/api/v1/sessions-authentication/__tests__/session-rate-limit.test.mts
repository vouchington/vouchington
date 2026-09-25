import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'

import { createDeviceAndSessionTokens, revokeSession } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

import { v7 } from 'uuid'

describe('Session route rate-limit identity', () => {
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
  }, 30_000)

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it('does not combine partial body token overrides with cookies', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_read: 2,
      anon_read_ttl: 60,
    })

    const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: v7() })
    const cookieHeader = [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`].join(
      '; ',
    )
    const request = createRequest()
    const requests = [
      { st: tokens.sessionToken.token },
      { st: tokens.sessionToken.token },
      { st: tokens.sessionToken.token },
    ]

    for (const body of requests) {
      await request
        .patch('/api/v1/session')
        .set('x-forwarded-for', nextTestRequestIp())
        .set('Cookie', cookieHeader)
        .send(body)
        .expect(200)
    }
  })

  it('treats revoked body token overrides as anonymous rate-limit identity', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_read: 10,
      anon_read_ttl: 60,
    })

    const sid = v7()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), sid, uid: v7() })
    await revokeSession(sid)

    await createRequest()
      .patch('/api/v1/session')
      .send({
        dt: tokens.deviceToken.token,
        st: tokens.sessionToken.token,
      })
      .expect(200)
  })

  it('rejects a JSON null session reset body with a bounded 4xx', async () => {
    const response = await createRequest()
      .delete('/api/v1/session')
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(422)

    expect(response.body.session).toBeUndefined()
  })
})
