import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { describe, expect, it, vi } from 'vitest'
import { createOwnedWebRiskFixture } from '@voucha/test-helpers/web-risk-state'

type WebRiskFixture = ReturnType<typeof createOwnedWebRiskFixture>
type WebRiskOptions = Parameters<typeof createOwnedWebRiskFixture>[0]

async function withStateFixtures(
  test: (ownFixture: (options?: WebRiskOptions) => WebRiskFixture) => Promise<void>,
): Promise<void> {
  const fixtures: WebRiskFixture[] = []
  function ownFixture(options?: WebRiskOptions): WebRiskFixture {
    const fixture = createOwnedWebRiskFixture(options)
    fixtures.push(fixture)
    return fixture
  }

  try {
    await test(ownFixture)
  } finally {
    await Promise.all(fixtures.splice(0).map(fixture => fixture.cleanup()))
  }
}

describe('web-risk state', () => {
  it('records the real default minute and month policies in one check', () =>
    withStateFixtures(async ownFixture => {
      const now = Date.UTC(2030, 0, 1)
      const fixture = ownFixture({ now: () => now })
      const [minuteKey, monthKey] = fixture.windowKeys()
      // Observe the actual library call; its implementation and returned promise are unchanged.
      const limiterSpy = vi.spyOn(RateLimiter, 'addAndCheckWindows')

      try {
        await expect(fixture.own(fixture.state.isLocallyRateLimited())).resolves.toBe(false)
        expect(limiterSpy).toHaveBeenCalledWith(
          [
            {
              prefix: `${fixture.namespace}-minute`,
              id: 'global',
              hashTag: new Date(now).toISOString().slice(0, 7),
              ttlSeconds: 60,
              threshold: 5_001,
            },
            {
              prefix: `${fixture.namespace}-month`,
              id: '',
              hashTag: new Date(now).toISOString().slice(0, 7),
              ttlSeconds: 31 * 24 * 60 * 60,
              threshold: 90_001,
              skipWriteWhenLimited: true,
            },
          ],
          { mode: 'stop-on-limited' },
        )
        expect(minuteKey.match(/\{([^}]*)\}/)?.[1]).toBe(monthKey.match(/\{([^}]*)\}/)?.[1])
        await expect(fixture.countWindow(minuteKey)).resolves.toBe(1)
        await expect(fixture.countWindow(monthKey)).resolves.toBe(1)
        expect(await fixture.ttl(minuteKey)).toBeGreaterThan(55_000)
        expect(await fixture.ttl(minuteKey)).toBeLessThanOrEqual(60_000)
        expect(await fixture.ttl(monthKey)).toBeGreaterThan(31 * 24 * 60 * 60 * 1000 - 5000)
        expect(await fixture.ttl(monthKey)).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000)
      } finally {
        limiterSpy.mockRestore()
      }
    }))

  it('does not increment month when the minute window blocks', () =>
    withStateFixtures(async ownFixture => {
      const fixture = ownFixture({ minuteThreshold: 1, monthThreshold: 10 })
      const [minuteKey, monthKey] = fixture.windowKeys()

      await expect(fixture.own(fixture.state.isLocallyRateLimited())).resolves.toBe(true)

      await expect(fixture.countWindow(minuteKey)).resolves.toBe(1)
      await expect(fixture.countWindow(monthKey)).resolves.toBe(0)
    }))

  it('does not append month members after the month window is capped', () =>
    withStateFixtures(async ownFixture => {
      const fixture = ownFixture({ minuteThreshold: 100, monthThreshold: 2 })
      const [, monthKey] = fixture.windowKeys()

      await expect(fixture.own(fixture.state.isLocallyRateLimited())).resolves.toBe(false)
      await expect(fixture.countWindow(monthKey)).resolves.toBe(1)
      await expect(fixture.own(fixture.state.isLocallyRateLimited())).resolves.toBe(true)
      await expect(fixture.countWindow(monthKey)).resolves.toBe(2)
      await expect(fixture.own(fixture.state.isLocallyRateLimited())).resolves.toBe(true)
      await expect(fixture.countWindow(monthKey)).resolves.toBe(2)
    }))

  it('fails open when the actual Valkey limiter encounters a wrong-type key', () =>
    withStateFixtures(async ownFixture => {
      const fixture = ownFixture()
      await fixture.corruptMinuteWindow()

      await expect(fixture.own(fixture.state.isLocallyRateLimited())).resolves.toBe(false)
    }))

  it('cleans only its owned namespace and leaves a neighbor owner intact', () =>
    withStateFixtures(async ownFixture => {
      const first = ownFixture({ minuteThreshold: 1, monthThreshold: 1 })
      const neighbor = ownFixture({ minuteThreshold: 2, monthThreshold: 2 })
      const firstKeys = [...first.windowKeys(), first.cooldownKey()]
      const neighborKeys = [...neighbor.windowKeys(), neighbor.cooldownKey()]
      await first.own(first.state.isLocallyRateLimited())
      await first.own(first.state.setProviderCooldown(60))
      await neighbor.own(neighbor.state.isLocallyRateLimited())
      await neighbor.own(neighbor.state.setProviderCooldown(60))

      await first.cleanup()

      await expect(first.keysExist(firstKeys)).resolves.toEqual([0, 0, 0])
      await expect(neighbor.keysExist(neighborKeys)).resolves.toEqual([1, 1, 1])
      const next = ownFixture()
      expect(next.namespace).not.toBe(first.namespace)
      await expect(next.own(next.state.isLocallyRateLimited())).resolves.toBe(false)
    }))

  it('selects the current UTC month on every check without deleting the old month', () =>
    withStateFixtures(async ownFixture => {
      let now = Date.UTC(2030, 0, 31, 23, 59, 59)
      const fixture = ownFixture({ now: () => now })
      const oldKeys = fixture.windowKeys()
      await fixture.own(fixture.state.isLocallyRateLimited())
      now = Date.UTC(2030, 1, 1)
      const newKeys = fixture.windowKeys()
      await fixture.own(fixture.state.isLocallyRateLimited())

      expect(newKeys).not.toEqual(oldKeys)
      await expect(fixture.countWindow(oldKeys[1])).resolves.toBe(1)
      await expect(fixture.countWindow(newKeys[1])).resolves.toBe(1)
    }))

  it('writes a seven-day exact URL cache and observes owned-key invalidation', () =>
    withStateFixtures(async ownFixture => {
      const fixture = ownFixture()
      const url = new URL(`https://${fixture.namespace}.test/page`)
      const different = new URL(`https://${fixture.namespace}.test/other`)
      const key = fixture.cleanKey(url)
      fixture.cleanKey(different)
      await fixture.own(fixture.state.cacheCleanVerdict(url))

      await expect(fixture.own(fixture.state.hasCleanCachedVerdict(url))).resolves.toBe(true)
      await expect(fixture.own(fixture.state.hasCleanCachedVerdict(different))).resolves.toBe(false)
      expect(await fixture.ttl(key)).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 5000)
      expect(await fixture.ttl(key)).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000)
      await fixture.invalidateCleanVerdict(url)
      await expect(fixture.own(fixture.state.hasCleanCachedVerdict(url))).resolves.toBe(false)
    }))

  it.each([
    ['numeric', '2', 2000],
    ['date rounded up', 'Tue, 01 Jan 2030 00:00:02 GMT', 2000],
    ['past date', 'Mon, 31 Dec 2029 23:59:59 GMT', 1000],
    ['invalid', 'invalid', 60_000],
    ['absent', null, 60_000],
  ])('preserves Retry-After policy for %s', async (_label, retryAfter, milliseconds) => {
    const fixture = createOwnedWebRiskFixture({
      now: () => Date.UTC(2030, 0, 1, 0, 0, 0, 500),
    })
    try {
      const headers = retryAfter === null ? undefined : { 'retry-after': retryAfter }
      await fixture.own(
        fixture.state.setProviderCooldownFromResponse(new Response(null, { headers })),
      )

      expect(await fixture.ttl(fixture.cooldownKey())).toBeGreaterThan(milliseconds - 500)
      expect(await fixture.ttl(fixture.cooldownKey())).toBeLessThanOrEqual(milliseconds)
      await expect(fixture.own(fixture.state.isProviderCoolingDown())).resolves.toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it('returns false after invalidating its owned provider cooldown key', () =>
    withStateFixtures(async ownFixture => {
      const fixture = ownFixture()
      await fixture.own(fixture.state.setProviderCooldown(60))
      await expect(fixture.own(fixture.state.isProviderCoolingDown())).resolves.toBe(true)

      await fixture.invalidateProviderCooldown()
      await expect(fixture.own(fixture.state.isProviderCoolingDown())).resolves.toBe(false)
    }))
})
