import { describe, expect, it } from 'vitest'

import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'

describe('cache-policy', () => {
  const staticCachedPaths = parseStaticCachedPaths('/favicon.ico,/robots.txt')

  it('bypasses cache for authenticated users', () => {
    const result = getCachePolicy({
      pathname: '/api/v1/posts',
      botTier: null,
      isAuthenticated: true,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('bypass')
  })

  it('uses long ttl for sitemap routes and strips all cookies', () => {
    const result = getCachePolicy({
      pathname: '/sitemap.xml',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(86_400)
    expect(result.fullyCachedRoute).toBe(true)
    expect(result.stripAllCookies).toBe(true)
  })

  it('uses staticCacheTtlSeconds for non-sitemap fully-cached routes', () => {
    const result = getCachePolicy({
      pathname: '/favicon.ico',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 3_600,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(3_600)
    expect(result.fullyCachedRoute).toBe(true)
    expect(result.stripAllCookies).toBe(true)
  })

  it('strips all cookies for bots when they can populate the shared cache', () => {
    const result = getCachePolicy({
      pathname: '/blog',
      botTier: 'known',
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(86_400)
    expect(result.stripAllCookies).toBe(true)
    expect(result.stripCookieNames.has('st')).toBe(true)
    expect(result.stripCookieNames.has('dt')).toBe(true)
  })

  it('uses short ttl for anonymous non-bot traffic', () => {
    const result = getCachePolicy({
      pathname: '/blog',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(30)
    expect(result.stripAllCookies).toBe(true)
  })

  it('assigns static audience to fully-cached routes', () => {
    const result = getCachePolicy({
      pathname: '/sitemap.xml',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.audience).toBe('static')
  })

  it('assigns bot audience to bot traffic', () => {
    const result = getCachePolicy({
      pathname: '/blog',
      botTier: 'known',
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.audience).toBe('bot')
  })

  it('assigns anon audience to anonymous human traffic', () => {
    const result = getCachePolicy({
      pathname: '/blog',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.audience).toBe('anon')
  })

  it('bot audience takes precedence over authentication', () => {
    const result = getCachePolicy({
      pathname: '/blog',
      botTier: 'known',
      isAuthenticated: true,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.audience).toBe('bot')
    expect(result.stripCookieNames.has('st')).toBe(true)
    expect(result.stripAllCookies).toBe(true)
  })

  it('sets staleWhileRevalidateSeconds to 2x TTL', () => {
    const anonResult = getCachePolicy({
      pathname: '/blog',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })
    expect(anonResult.staleWhileRevalidateSeconds).toBe(60)

    const botResult = getCachePolicy({
      pathname: '/blog',
      botTier: 'unknown',
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })
    expect(botResult.staleWhileRevalidateSeconds).toBe(172_800)
  })

  it('strips all cookies for anonymous human traffic when it can populate the shared cache', () => {
    const result = getCachePolicy({
      pathname: '/blog',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.stripCookieNames.size).toBe(0)
    expect(result.stripAllCookies).toBe(true)
  })

  it('assigns null audience to authenticated traffic (bypass)', () => {
    const result = getCachePolicy({
      pathname: '/blog',
      botTier: null,
      isAuthenticated: true,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.audience).toBeNull()
    expect(result.stripAllCookies).toBe(false)
  })
})
