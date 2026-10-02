import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { routeRateLimitConfig } from '@services/route-rate-limits'
import { readAnonymousApiUsageRows } from '@voucha/test-helpers/api-usage-analytics'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  registerRestUsageRoutes,
  usageQuotaKeys,
  useRestUsageMetering,
  waitForAnonymousUsageRows,
} from '@voucha/test-helpers/rest-usage-meter'

const BASE = '/api/v1/__tests__/rest-usage-anonymous'
registerRestUsageRoutes(BASE)

describe('REST usage metering for an anonymous caller', () => {
  useRestUsageMetering('rest-usage-anonymous-test-')

  // Anonymous rows carry no user to filter on, so this first test owns every row it counts and the
  // second counts relative to what it finds.
  it('meters one aggregate with no IP, device or session dimension', async () => {
    const ip = '2001:db8:1557:a::7'
    const did = v7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did })
    const request = createRequest()
    request.set('x-forwarded-for', ip)
    request.set('Cookie', `dt=${deviceToken.token}; st=${sessionToken.token}`)

    await request.get(`${BASE}/ok`).expect(200)
    await request.get(`${BASE}/missing`).expect(404)
    await request.get(`${BASE}/boom`).expect(500)
    await request.get(`${BASE}/ip-only`).expect(200)

    const rows = await waitForAnonymousUsageRows(4)
    expect(rows.map(row => [Number(row.status_code), Number(row.units)])).toEqual([
      [200, 1],
      [200, 1],
      [404, 1],
      [500, 0],
    ])
    for (const row of rows) {
      expect(row).toMatchObject({
        surface: 'rest_anonymous',
        credential: 'anonymous',
        plan: 'free',
        scope_class: 'read',
      })
      expect(row.user_id ?? null).toBeNull()
      expect(row.api_key_id ?? null).toBeNull()
      expect(row.oauth_client_id ?? null).toBeNull()
    }
    const serialized = JSON.stringify(rows)
    const keys = await usageQuotaKeys()
    for (const identifier of [ip, did, sessionToken.payload.sid, deviceToken.token]) {
      expect(serialized).not.toContain(identifier)
      expect(keys.filter(key => key.includes(identifier))).toEqual([])
    }
    expect(keys.filter(key => key.includes('rest_anonymous'))).toEqual([
      expect.stringContaining('rest_anonymous:aggregate'),
    ])
  })

  it('is not a usage event when the attempt limit refuses first', async () => {
    const statuses = (rows: Record<string, unknown>[]) => rows.map(row => Number(row.status_code))
    const before = statuses(await readAnonymousApiUsageRows())
    // The attempt that reaches the threshold is the first one refused.
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { anon_write: 2 })
    const request = createRequest()
    await request.post(`${BASE}/write`).send({}).expect(202)
    await request.post(`${BASE}/write`).send({}).expect(429)
    // Responses settle in order, so by the time this one is in, a refusal that settled is too.
    await request.get(`${BASE}/ok`).expect(200)

    const rows = await waitForAnonymousUsageRows(before.length + 2)

    expect(statuses(rows)).toEqual([...before, 202, 200].toSorted((a, b) => a - b))
  })
})
