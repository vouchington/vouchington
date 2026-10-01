import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RateLimiter } from '@data-stores/valkey-rate-limiter'
import {
  readAnonymousApiUsageRows,
  readApiUsageRows,
  startLocalAnalyticsForTest,
} from '@voucha/test-helpers/api-usage-analytics'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { routeRateLimitConfig } from './config.mts'
import { checkUsageQuota, settleUsage } from './usage-quota.mts'
import type { UsageIdentity, UsageQuota, UsageSettlement, UsageSurface } from './usage-types.mts'

const QUOTA: UsageQuota = { limit: 2, windowSeconds: 60 }

type ApiKeyIdentity = Extract<UsageIdentity, { credential: 'api_key' }>
type OAuthIdentity = Extract<UsageIdentity, { credential: 'oauth' }>

function apiKeyIdentity(userId = randomUUID()): ApiKeyIdentity {
  return { credential: 'api_key', userId, apiKeyId: randomUUID() }
}

function settlement(
  identity: UsageIdentity,
  statusCode: number,
  surface: UsageSurface = 'mcp_user',
): UsageSettlement {
  return {
    surface,
    identity,
    plan: 'free',
    scopeClass: 'write',
    quota: QUOTA,
    statusCode,
    durationMs: 12.4,
  }
}

describe('usage quota', () => {
  let stopLocalAnalytics: () => Promise<void>

  beforeAll(async () => {
    stopLocalAnalytics = await startLocalAnalyticsForTest('usage-quota-test-')
    await routeRateLimitConfig.waitForInitialization()
    // Keep local overrides from being replaced by cross-fork DynamicConfig pub/sub messages.
    routeRateLimitConfig.unsubscribe()
  })

  // Route rate limiting is off by default under test, so each case opts in and puts it back after.
  beforeEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterAll(async () => {
    await stopLocalAnalytics()
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it('charges a served 2xx and a served 4xx against the quota', async () => {
    const identity = apiKeyIdentity()
    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toMatchObject({
      limited: false,
    })

    await settleUsage(settlement(identity, 200))
    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toMatchObject({
      limited: false,
    })
    await settleUsage(settlement(identity, 404))

    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toEqual({
      limited: true,
      retryAfterSeconds: QUOTA.windowSeconds,
    })
  })

  it('does not charge a 429 or an actual 5xx', async () => {
    const identity = apiKeyIdentity()

    for (const statusCode of [429, 500, 502, 503, 599]) {
      await settleUsage(settlement(identity, statusCode))
    }
    await settleUsage(settlement(identity, 200))

    // Five refused or failed requests left the quota at one of two, so it is still open.
    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toMatchObject({
      limited: false,
    })
    await settleUsage(settlement(identity, 403))
    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toMatchObject({
      limited: true,
    })
  })

  it('draws every credential of one user on one allowance, per surface', async () => {
    const userId = randomUUID()
    await settleUsage(settlement(apiKeyIdentity(userId), 200))
    await settleUsage(
      settlement(
        { credential: 'oauth', userId, oauthClientId: randomUUID(), oauthGrantId: randomUUID() },
        200,
      ),
    )

    await expect(checkUsageQuota('mcp_user', userId, QUOTA)).resolves.toMatchObject({
      limited: true,
    })
    await expect(checkUsageQuota('mcp_admin', userId, QUOTA)).resolves.toMatchObject({
      limited: false,
    })
    await expect(checkUsageQuota('mcp_user', randomUUID(), QUOTA)).resolves.toMatchObject({
      limited: false,
    })
  })

  it('does not charge the quota it is checking', async () => {
    const identity = apiKeyIdentity()
    await settleUsage(settlement(identity, 200))

    for (let check = 0; check < 5; check++) {
      await checkUsageQuota('mcp_user', identity.userId, QUOTA)
    }

    await settleUsage(settlement(identity, 200))
    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toMatchObject({
      limited: true,
    })
  })

  it('reports every response with the validated identity dimensions', async () => {
    const apiKey = apiKeyIdentity()
    const oauth: OAuthIdentity = {
      credential: 'oauth',
      userId: randomUUID(),
      oauthClientId: `client-${randomUUID()}`,
      oauthGrantId: randomUUID(),
    }

    await settleUsage(settlement(apiKey, 200))
    await settleUsage(settlement(apiKey, 503))
    await settleUsage(settlement(oauth, 429, 'mcp_admin'))

    const apiKeyRows = await readApiUsageRows(apiKey.userId)
    expect(apiKeyRows.map(row => [Number(row.status_code), Number(row.units)])).toEqual([
      [200, 1],
      [503, 0],
    ])
    expect(apiKeyRows[0]).toMatchObject({
      surface: 'mcp_user',
      credential: 'api_key',
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
      plan: 'free',
      scope_class: 'write',
      unit: 'request',
    })
    expect(Number(apiKeyRows[0]!.quota_limit)).toBe(QUOTA.limit)
    expect(Number(apiKeyRows[0]!.duration_ms)).toBe(12)
    expect(apiKeyRows[0]!.oauth_client_id ?? null).toBeNull()
    expect(apiKeyRows[0]!.oauth_grant_id ?? null).toBeNull()

    const [oauthRow, ...rest] = await readApiUsageRows(oauth.userId)
    expect(rest).toEqual([])
    expect(oauthRow).toMatchObject({
      surface: 'mcp_admin',
      credential: 'oauth',
      user_id: oauth.userId,
      oauth_client_id: oauth.oauthClientId,
      oauth_grant_id: oauth.oauthGrantId,
    })
    expect(Number(oauthRow!.units)).toBe(0)
    expect(oauthRow!.api_key_id ?? null).toBeNull()
  })

  it('charges and reports a signed-in REST user by id alone', async () => {
    const identity: UsageIdentity = { credential: 'session', userId: randomUUID() }

    await settleUsage(settlement(identity, 200, 'rest_user'))
    await settleUsage(settlement(identity, 404, 'rest_user'))

    await expect(checkUsageQuota('rest_user', identity.userId, QUOTA)).resolves.toMatchObject({
      limited: true,
    })
    const rows = await readApiUsageRows(identity.userId)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      surface: 'rest_user',
      credential: 'session',
      user_id: identity.userId,
    })
    expect(rows[0]!.api_key_id ?? null).toBeNull()
    expect(rows[0]!.oauth_client_id ?? null).toBeNull()
  })

  it('charges anonymous REST traffic to one aggregate bucket with no caller dimension', async () => {
    const limiter = {
      add: vi.fn<RateLimiter['add']>(),
      isRateLimited: vi.fn<RateLimiter['isRateLimited']>(),
    }
    const reportError = vi.fn<(error: Error) => void>()

    await settleUsage(settlement({ credential: 'anonymous' }, 200, 'rest_anonymous'), {
      limiter,
      reportError,
    })

    expect(limiter.add).toHaveBeenCalledExactlyOnceWith(['rest_anonymous:aggregate'])
    const [row, ...rest] = await readAnonymousApiUsageRows()
    expect(rest).toEqual([])
    expect(row).toMatchObject({ surface: 'rest_anonymous', credential: 'anonymous', units: 1 })
    expect(row!.user_id ?? null).toBeNull()
    expect(row!.api_key_id ?? null).toBeNull()
    expect(row!.oauth_client_id ?? null).toBeNull()
  })

  it('stops enforcing when route rate limiting is off but still reports usage', async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    const identity = apiKeyIdentity()

    for (let request = 0; request < 3; request++) await settleUsage(settlement(identity, 200))

    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toEqual({
      limited: false,
      retryAfterSeconds: 0,
    })
    // Nothing was charged while it was off, so re-enabling starts from an open quota.
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
    await expect(checkUsageQuota('mcp_user', identity.userId, QUOTA)).resolves.toMatchObject({
      limited: false,
    })
    expect(await readApiUsageRows(identity.userId)).toHaveLength(3)
  })

  describe('when Valkey fails', () => {
    function failingDependencies(failure: unknown) {
      const reportError = vi.fn<(error: Error) => void>()
      const limiter = {
        isRateLimited: vi.fn<RateLimiter['isRateLimited']>().mockRejectedValue(failure),
        add: vi.fn<RateLimiter['add']>().mockRejectedValue(failure),
      }
      return { limiter, reportError }
    }

    it('fails open and reports the error when checking the quota', async () => {
      const failure = new Error('Valkey unavailable')
      const dependencies = failingDependencies(failure)

      await expect(checkUsageQuota('mcp_user', randomUUID(), QUOTA, dependencies)).resolves.toEqual(
        { limited: false, retryAfterSeconds: 0 },
      )

      expect(dependencies.limiter.isRateLimited).toHaveBeenCalledTimes(1)
      expect(dependencies.reportError).toHaveBeenCalledExactlyOnceWith(failure)
    })

    it('reports a non-Error failure as an Error', async () => {
      const dependencies = failingDependencies('connection reset')

      await checkUsageQuota('mcp_user', randomUUID(), QUOTA, dependencies)
      await settleUsage(settlement(apiKeyIdentity(), 200), dependencies)

      expect(dependencies.reportError.mock.calls).toEqual([
        [new Error('connection reset')],
        [new Error('connection reset')],
      ])
    })

    it('reports the error but still emits the usage event when charging the quota', async () => {
      const failure = new Error('Valkey unavailable')
      const dependencies = failingDependencies(failure)
      const identity = apiKeyIdentity()

      await expect(settleUsage(settlement(identity, 200), dependencies)).resolves.toBeUndefined()

      expect(dependencies.limiter.add).toHaveBeenCalledTimes(1)
      expect(dependencies.reportError).toHaveBeenCalledExactlyOnceWith(failure)
      const [row, ...rest] = await readApiUsageRows(identity.userId)
      expect(rest).toEqual([])
      expect(Number(row!.units)).toBe(1)
    })

    it('does not touch Valkey to settle a request that is not charged', async () => {
      const dependencies = failingDependencies(new Error('Valkey unavailable'))

      await settleUsage(settlement(apiKeyIdentity(), 503), dependencies)

      expect(dependencies.limiter.add).not.toHaveBeenCalled()
      expect(dependencies.reportError).not.toHaveBeenCalled()
    })
  })
})
