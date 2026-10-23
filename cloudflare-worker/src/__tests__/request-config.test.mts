import { describe, expect, it } from 'vitest'
import { getWorkerRequestConfig } from '../request-config.mts'

describe('getWorkerRequestConfig anonymous cache TTL', () => {
  it('defaults to the PR1 safety TTL of 30 seconds', () => {
    expect(getWorkerRequestConfig({}).anonCacheTtlSeconds).toBe(30)
  })

  it('uses a positive ANON_CACHE_TTL_SECONDS override', () => {
    expect(getWorkerRequestConfig({ ANON_CACHE_TTL_SECONDS: '123' }).anonCacheTtlSeconds).toBe(123)
  })

  it('caps sitemap cache lifetime so retired generation files remain available', () => {
    expect(
      getWorkerRequestConfig({ SITEMAP_CACHE_TTL_SECONDS: '604800' }).sitemapCacheTtlSeconds,
    ).toBe(86_400)
  })

  it('keeps Voucha discovery defaults while adding configured cache paths', () => {
    const paths = getWorkerRequestConfig({
      CACHED_STATIC_PATHS: '/custom/path, /another/path',
    }).staticCachedPaths

    expect(paths).toBeInstanceOf(Set)
    expect(paths.has('/.well-known/security.txt')).toBe(true)
    expect(paths.has('/.well-known/api-catalog')).toBe(true)
    expect(paths.has('/favicon.ico')).toBe(true)
    expect(paths.has('/custom/path')).toBe(true)
    expect(paths.has('/another/path')).toBe(true)
  })
})
