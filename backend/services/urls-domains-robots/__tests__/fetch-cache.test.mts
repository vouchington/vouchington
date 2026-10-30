import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock as captureException } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { fetchRobotsTxtCached } from '../index.mts'

const ALLOW_ROBOTS_TXT = 'User-agent: *\nAllow: /'
const DISALLOW_ROBOTS_TXT = 'User-agent: *\nDisallow: /'
const UNREACHABLE_TTL_SECONDS = 15 * 60

function randomDomain() {
  return `test-robots-${Math.random().toString(36).slice(2)}.com`
}

function robotsCachePair() {
  return {
    rules: new ValkeyCache({
      prefix: 'urls-domains-robots',
      ttlSeconds: 60 * 60 * 24,
    }),
    unreachable: new ValkeyCache({
      prefix: 'urls-domains-robots-unreachable',
      ttlSeconds: UNREACHABLE_TTL_SECONDS,
    }),
  }
}

function cachedFetchDependencies(
  fetchWithTimeoutSimple: ReturnType<typeof vi.fn<VitestLooseMock>>,
) {
  return {
    fetchWithTimeoutSimple,
    checkDomainBlacklisted: async () => false,
    isNetworkError: () => false,
    isRetryableError: () => false,
    retryDelayMs: 0,
  }
}

describe('fetchRobotsTxtCached unreachable decisions', () => {
  it('remembers complete disallow on the short marker without writing the 24-hour rules cache', async () => {
    const domain = randomDomain()
    const { rules, unreachable } = robotsCachePair()
    const fetchWithTimeoutSimple = vi.fn<VitestLooseMock>().mockResolvedValue({
      status: 503,
      statusText: 'Service Unavailable',
      body: { cancel: () => Promise.resolve() },
    })

    try {
      await expect(
        fetchRobotsTxtCached(domain, cachedFetchDependencies(fetchWithTimeoutSimple)),
      ).resolves.toBe(DISALLOW_ROBOTS_TXT)
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
      expect(await rules.get(domain)).toBeNull()
      expect(await unreachable.get(domain)).toBe('unreachable')
      const ttlSeconds = await cacheValkeyClient.ttl(unreachable.getKey(domain))
      expect(ttlSeconds).toBeGreaterThan(14 * 60)
      expect(ttlSeconds).toBeLessThanOrEqual(UNREACHABLE_TTL_SECONDS)

      await expect(
        fetchRobotsTxtCached(domain, cachedFetchDependencies(fetchWithTimeoutSimple)),
      ).resolves.toBe(DISALLOW_ROBOTS_TXT)
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
    } finally {
      await rules.delete(domain)
      await unreachable.delete(domain)
    }
  })

  it('keeps a robots.txt body that arrives while an unreachable fetch is retrying', async () => {
    const domain = randomDomain()
    const { rules, unreachable } = robotsCachePair()
    const body = 'User-agent: *\nDisallow: /secret'
    const fetchWithTimeoutSimple = vi.fn<VitestLooseMock>(async () => {
      await rules.set(domain, body)
      return {
        status: 503,
        statusText: 'Service Unavailable',
        body: { cancel: () => Promise.resolve() },
      }
    })

    try {
      await expect(
        fetchRobotsTxtCached(domain, cachedFetchDependencies(fetchWithTimeoutSimple)),
      ).resolves.toBe(body)
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
      expect(await rules.get(domain)).toBe(body)
      expect(await unreachable.get(domain)).toBeNull()

      await fetchRobotsTxtCached(domain, cachedFetchDependencies(fetchWithTimeoutSimple))
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(3)
    } finally {
      await rules.delete(domain)
      await unreachable.delete(domain)
    }
  })

  it('reads a cached unreachable marker together with the rules key', async () => {
    const domain = randomDomain()
    const { rules, unreachable } = robotsCachePair()
    const fetchWithTimeoutSimple = vi.fn<VitestLooseMock>().mockResolvedValue({
      status: 503,
      statusText: 'Service Unavailable',
      body: { cancel: () => Promise.resolve() },
    })
    const dependencies = cachedFetchDependencies(fetchWithTimeoutSimple)
    const mget = vi.spyOn(cacheValkeyClient, 'mget')

    try {
      await fetchRobotsTxtCached(domain, dependencies)
      fetchWithTimeoutSimple.mockClear()
      mget.mockClear()

      await expect(fetchRobotsTxtCached(domain, dependencies)).resolves.toBe(DISALLOW_ROBOTS_TXT)
      expect(fetchWithTimeoutSimple).not.toHaveBeenCalled()
      expect(mget).toHaveBeenCalledOnce()
      expect(mget.mock.calls[0]?.[0]).toEqual([rules.getKey(domain), unreachable.getKey(domain)])
    } finally {
      mget.mockRestore()
      await rules.delete(domain)
      await unreachable.delete(domain)
    }
  })

  it('fetches robots.txt when the combined cache read fails', async () => {
    const domain = randomDomain()
    const { rules, unreachable } = robotsCachePair()
    const fetchWithTimeoutSimple = vi.fn<VitestLooseMock>().mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
      body: { cancel: () => Promise.resolve() },
    })
    const cacheError = new Error(`robots cache unavailable ${domain}`)
    const rulesKey = rules.getKey(domain)
    const unreachableKey = unreachable.getKey(domain)
    const originalMget = cacheValkeyClient.mget
    const mget = vi.spyOn(cacheValkeyClient, 'mget').mockImplementation((keys, options) => {
      if (Array.isArray(keys) && keys.some(key => key === rulesKey || key === unreachableKey)) {
        return Promise.reject(cacheError)
      }
      return originalMget.call(cacheValkeyClient, keys, options)
    })

    try {
      await expect(
        fetchRobotsTxtCached(domain, cachedFetchDependencies(fetchWithTimeoutSimple)),
      ).resolves.toBe(ALLOW_ROBOTS_TXT)
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(1)
      expect(await rules.get(domain)).toBe(ALLOW_ROBOTS_TXT)
      expect(await unreachable.get(domain)).toBeNull()
      expect(captureException.mock.calls.some(([error]) => error === cacheError)).toBe(true)
    } finally {
      mget.mockRestore()
      await rules.delete(domain)
      await unreachable.delete(domain)
    }
  })

  it('caches an HTTP 404 allow decision on the 24-hour rules key', async () => {
    const domain = randomDomain()
    const { rules, unreachable } = robotsCachePair()
    const fetchWithTimeoutSimple = vi.fn<VitestLooseMock>().mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
      body: { cancel: () => Promise.resolve() },
    })

    try {
      await expect(
        fetchRobotsTxtCached(domain, cachedFetchDependencies(fetchWithTimeoutSimple)),
      ).resolves.toBe(ALLOW_ROBOTS_TXT)
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(1)
      expect(await rules.get(domain)).toBe(ALLOW_ROBOTS_TXT)
      expect(await unreachable.get(domain)).toBeNull()

      await fetchRobotsTxtCached(domain, cachedFetchDependencies(fetchWithTimeoutSimple))
      expect(fetchWithTimeoutSimple).toHaveBeenCalledTimes(1)
    } finally {
      await rules.delete(domain)
      await unreachable.delete(domain)
    }
  })
})
