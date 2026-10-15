import { describe, expect, it, onTestFinished } from 'vitest'
import { rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { routeRateLimitConfig, selectUsageQuota, settleUsage } from '@services/route-rate-limits'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { readApiUsageRows } from '@voucha/test-helpers/api-usage-analytics'
import {
  holdOwnedResponseUsageCharge,
  withResponseUsageSettlements,
} from '@voucha/test-helpers/usage-settlement'
import { onResponseUsageSettlement, type ResponseUsageSettlement } from '../usage-meter-helpers.mts'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  registerRestUsageRoutes,
  usageQuotaKeys,
  useRestUsageMetering,
} from '@voucha/test-helpers/rest-usage-meter'

const BASE = `/api/v1/__tests__/rest-usage-user-${crypto.randomUUID()}`
registerRestUsageRoutes(BASE)

async function signedIn(plan?: 'plus') {
  const user = await createTestUser()
  if (plan) await createTestMembership({ user_id: user.id, plan })
  const request = createRequest()
  await request.authenticateAs(user)
  return { user, request }
}

async function userQuotaSize(userId: string) {
  const key = (await usageQuotaKeys()).find(entry => entry.includes(userId))
  return rateLimiterValkeyClient.zcard(key!)
}

async function spendWriteQuota(userId: string) {
  const quota = selectUsageQuota({ surface: 'rest_user', plan: 'free', scopeClass: 'write' })
  for (let charged = 0; charged < quota.limit; charged += 50) {
    await Promise.all(
      Array.from({ length: Math.min(50, quota.limit - charged) }, () =>
        settleUsage({
          surface: 'rest_user',
          identity: { credential: 'session', userId },
          plan: 'free',
          scopeClass: 'write',
          quota,
          statusCode: 200,
          durationMs: 1,
        }),
      ),
    )
  }
  return quota
}

describe('REST usage metering for a signed-in user', () => {
  useRestUsageMetering('rest-usage-user-test-')

  it('meters by user id and the route scope class, never by device or session', async () => {
    const { user, request } = await signedIn()
    const writer = await signedIn()

    await withResponseUsageSettlements(BASE, async () => {
      await request.get(`${BASE}/ok`).expect(200)
      await writer.request.post(`${BASE}/write`).send({}).expect(202)
    })

    const [row, ...rest] = await readApiUsageRows(user.id)
    expect(rest).toEqual([])
    expect(row).toMatchObject({
      surface: 'rest_user',
      credential: 'session',
      user_id: user.id,
      plan: 'free',
      scope_class: 'read',
      unit: 'request',
      status_code: 200,
    })
    expect(Number(row!.units)).toBe(1)
    expect(Number(row!.quota_limit)).toBe(
      selectUsageQuota({ surface: 'rest_user', plan: 'free', scopeClass: 'read' }).limit,
    )
    expect(row!.api_key_id ?? null).toBeNull()
    expect(row!.oauth_client_id ?? null).toBeNull()
    expect(JSON.stringify(row)).not.toContain(request.sid)
    expect(JSON.stringify(row)).not.toContain(request.did)
    const keys = await usageQuotaKeys()
    expect(keys.some(key => key.includes(user.id))).toBe(true)
    expect(keys.filter(key => key.includes(request.did) || key.includes(request.sid))).toEqual([])

    const [writeRow] = await readApiUsageRows(writer.user.id)
    expect(writeRow).toMatchObject({ scope_class: 'write', status_code: 202 })
    expect(Number(writeRow!.quota_limit)).toBe(
      selectUsageQuota({ surface: 'rest_user', plan: 'free', scopeClass: 'write' }).limit,
    )
  })

  // `loaded` routes load the user before the limit; `ok` routes leave it to the meter to read.
  it.each(['ok', 'loaded'])('sizes the quota by membership plan on a %s route', async route => {
    const { user, request } = await signedIn('plus')

    await withResponseUsageSettlements(BASE, () => request.get(`${BASE}/${route}`).expect(200))

    const [row] = await readApiUsageRows(user.id)
    expect(row).toMatchObject({ plan: 'plus', scope_class: 'read' })
    expect(Number(row!.quota_limit)).toBe(
      selectUsageQuota({ surface: 'rest_user', plan: 'plus', scopeClass: 'read' }).limit,
    )
  })

  it('charges a served 2xx and 4xx but never an actual 5xx', async () => {
    const { user, request } = await signedIn()

    await withResponseUsageSettlements(BASE, async () => {
      await request.get(`${BASE}/ok`).expect(200)
      await request.get(`${BASE}/missing`).expect(404)
      await request.get(`${BASE}/boom`).expect(500)
    })

    const rows = await readApiUsageRows(user.id)
    expect(rows).toHaveLength(3)
    expect(rows.map(row => [Number(row.status_code), Number(row.units)])).toEqual([
      [200, 1],
      [404, 1],
      [500, 0],
    ])
    expect(await userQuotaSize(user.id)).toBe(2)
  })

  it('meters once however many times a route applies the limit', async () => {
    const { user, request } = await signedIn()

    await withResponseUsageSettlements(BASE, () => request.get(`${BASE}/twice`).expect(200))

    expect(await readApiUsageRows(user.id)).toHaveLength(1)
    expect(await userQuotaSize(user.id)).toBe(1)
  })

  it('refuses with a Retry-After once spent, except on session routes', async () => {
    const { user, request } = await signedIn()
    const quota = await spendWriteQuota(user.id)

    const limited = await withResponseUsageSettlements(BASE, () =>
      request.post(`${BASE}/write`).send({}).expect(429),
    )

    expect(limited.body.message).toBe('Usage quota exceeded')
    expect(limited.headers['retry-after']).toBe(String(quota.windowSeconds))
    expect(limited.headers['x-ratelimit-limit']).toBeUndefined()
    expect(limited.headers['x-ratelimit-remaining']).toBeUndefined()
    const rows = await readApiUsageRows(user.id)
    expect(rows.some(row => Number(row.status_code) === 429)).toBe(true)
    expect(rows.reduce((units, row) => units + Number(row.units), 0)).toBe(quota.limit)
    await withResponseUsageSettlements(
      BASE,
      async () => {
        // The refusal charged nothing, and a read request is still inside its larger allowance.
        await request.get(`${BASE}/ok`).expect(200)
        // Signing out stays possible while the allowance is spent.
        await request.delete('/api/v1/session').expect(200)
        // A different user keeps a full allowance.
        const other = await signedIn()
        await other.request.post(`${BASE}/write`).send({}).expect(202)
      },
      { ownedUserIds: [user.id] },
    )
  })

  it('does not meter at all while route rate limiting is off', async () => {
    const { user, request } = await signedIn()
    await withResponseUsageSettlements(BASE, async () => {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
      await request.get(`${BASE}/ok`).expect(200)
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
      await request.get(`${BASE}/missing`).expect(404)
    })

    const [row, ...rest] = await readApiUsageRows(user.id)
    expect(rest).toEqual([])
    expect(row).toMatchObject({ status_code: 404 })
  })

  it('keeps its real settlement pending after HTTP close until the owned charge finishes', async () => {
    const { user, request } = await signedIn()
    const privateQuery = crypto.randomUUID()
    const charge = holdOwnedResponseUsageCharge(user.id)
    let receipt: ResponseUsageSettlement | undefined
    let off = () => {}
    onTestFinished(() => {
      charge.release()
      off()
    })
    off = onResponseUsageSettlement(event => {
      if (event.ownerUserId === user.id) receipt = event
      return undefined
    })
    await withResponseUsageSettlements(
      BASE,
      async () => {
        await request.get(`${BASE}/ok?private=${privateQuery}`).expect(200)
        await charge.entered
        expect(receipt).toMatchObject({ pathname: `${BASE}/ok`, ownerUserId: user.id })
        expect(receipt).not.toHaveProperty('request')
        expect(JSON.stringify(receipt)).not.toContain(privateQuery)
        expect(JSON.stringify(receipt)).not.toContain(request.authCookie)
        const completion = receipt!.completion
        await expect(
          Promise.race([completion.then(() => 'settled'), charge.entered.then(() => 'blocked')]),
        ).resolves.toBe('blocked')
        charge.release()
        await expect(completion).resolves.toEqual({ status: 'fulfilled', value: undefined })
      },
      { release: charge.release },
    )
    const rows = await readApiUsageRows(user.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status_code: 200, units: 1, user_id: user.id })
  })
})
