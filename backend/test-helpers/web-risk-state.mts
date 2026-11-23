import { createHash, randomUUID } from 'node:crypto'
import { vi, type Mock } from 'vitest'
import * as http from '../modules/utils/http.mts'
import { RateLimiter, rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { createWebRiskState } from '../services/web-risk/state.mts'
import { createWebRiskChecker } from '../services/web-risk/check.mts'
import { webRiskConfig } from '../services/web-risk/config.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

type OwnedWebRiskOptions = {
  now?: () => number
  minuteThreshold?: number
  monthThreshold?: number
}

/** Expire only this test's randomized URL, leaving shared provider budgets untouched. */
export async function expireWebRiskCleanVerdictForTest(url: string): Promise<void> {
  const hash = createHash('sha256').update(new URL(url).toString()).digest('hex')
  await rateLimiterValkeyClient.customCommand(['PEXPIRE', `web-risk:clean:${hash}`, '0'])
}

/** A real checker/state with only the finite fixture namespace's used keys eligible for cleanup. */
export function createOwnedWebRiskFixture(options: OwnedWebRiskOptions = {}) {
  const namespace = `web-risk-test-${randomUUID()}`
  const now = options.now ?? (() => Date.now())
  const state = createWebRiskState({ ...options, namespace, now })
  const actualCheck = createWebRiskChecker(state)
  const keys = new Set<string>()
  const calls: Promise<unknown>[] = []

  function own<T>(call: Promise<T>): Promise<T> {
    calls.push(call)
    return call
  }

  function windowKeys(): [string, string] {
    const monthBucket = new Date(now()).toISOString().slice(0, 7)
    const windows = [
      { prefix: `${namespace}-minute`, id: 'global' },
      { prefix: `${namespace}-month`, id: '' },
    ]
    const result = windows.map(window =>
      RateLimiter.getWindowKey({
        ...window,
        hashTag: monthBucket,
        ttlSeconds: 60,
        threshold: 1,
      }),
    )
    for (const key of result) keys.add(key)
    return [result[0]!, result[1]!]
  }

  function cooldownKey(): string {
    const key = `${namespace}:cooldown`
    keys.add(key)
    return key
  }

  function cleanKey(url: URL): string {
    const hash = createHash('sha256').update(url.toString()).digest('hex')
    const key = `${namespace}:clean:${hash}`
    keys.add(key)
    return key
  }

  function check(url: string, checkOptions?: Parameters<typeof actualCheck>[1]): Promise<void> {
    windowKeys()
    cooldownKey()
    try {
      cleanKey(new URL(url))
    } catch {
      // Invalid URLs create no clean cache entry.
    }
    // A request can cross the UTC month boundary while its preflight awaits real stores.
    return own(
      actualCheck(url, checkOptions).finally(() => {
        windowKeys()
      }),
    )
  }

  async function countWindow(key: string): Promise<number> {
    return Number(await rateLimiterValkeyClient.customCommand(['ZCARD', key]))
  }

  async function keysExist(ownedKeys: readonly string[]): Promise<number[]> {
    return Promise.all(ownedKeys.map(key => rateLimiterValkeyClient.exists([key])))
  }

  async function ttl(key: string): Promise<number> {
    return rateLimiterValkeyClient.pttl(key)
  }

  async function invalidateCleanVerdict(url: URL): Promise<void> {
    await rateLimiterValkeyClient.customCommand(['PEXPIRE', cleanKey(url), '0'])
  }

  async function invalidateProviderCooldown(): Promise<void> {
    await rateLimiterValkeyClient.customCommand(['PEXPIRE', cooldownKey(), '0'])
  }

  async function corruptMinuteWindow(): Promise<void> {
    await rateLimiterValkeyClient.set(windowKeys()[0], 'owned wrong-type fixture')
  }

  async function cleanup(): Promise<void> {
    await Promise.allSettled(calls.splice(0))
    if (keys.size > 0) await rateLimiterValkeyClient.unlink([...keys])
  }

  windowKeys()
  cooldownKey()
  return {
    namespace,
    state,
    own,
    check,
    windowKeys,
    cooldownKey,
    cleanKey,
    countWindow,
    keysExist,
    ttl,
    invalidateCleanVerdict,
    invalidateProviderCooldown,
    corruptMinuteWindow,
    cleanup,
  }
}

type WebRiskTestContext = {
  fixture: ReturnType<typeof createOwnedWebRiskFixture>
  ownFixture: (options?: OwnedWebRiskOptions) => ReturnType<typeof createOwnedWebRiskFixture>
  setEnabled: (enabled: boolean) => void
  fetchSpy: Mock<ExternalFetch>
}

type ExternalFetch = ReturnType<typeof http.getExternalFetch>

export async function withGoogleWebRiskTest(
  test: (context: WebRiskTestContext) => Promise<void>,
): Promise<void> {
  const fixtures: ReturnType<typeof createOwnedWebRiskFixture>[] = []
  const restores: (() => void)[] = []

  function ownFixture(options?: OwnedWebRiskOptions): ReturnType<typeof createOwnedWebRiskFixture> {
    const owned = createOwnedWebRiskFixture(options)
    fixtures.push(owned)
    return owned
  }

  try {
    vi.stubEnv('GOOGLE_WEB_RISK_API_KEY', 'test-web-risk-key')
    await webRiskConfig.waitForInitialization()
    restores.push(overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true }))
    const fixture = ownFixture()
    const activeFetchSpy = vi
      .fn<ExternalFetch>()
      .mockRejectedValue(new Error('Unexpected Web Risk provider request'))
    restores.push(() => vi.mocked(http.getExternalFetch).mockRestore())
    vi.spyOn(http, 'getExternalFetch').mockReturnValue(activeFetchSpy)
    const context: WebRiskTestContext = {
      fixture,
      ownFixture,
      setEnabled: enabled => {
        restores.push(overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled }))
      },
      fetchSpy: activeFetchSpy,
    }
    await test(context)
  } finally {
    try {
      await Promise.all(fixtures.splice(0).map(owned => owned.cleanup()))
    } finally {
      for (const restore of restores.splice(0).toReversed()) restore()
      vi.unstubAllEnvs()
    }
  }
}
