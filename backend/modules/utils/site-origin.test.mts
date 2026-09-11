import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSiteOrigin, getSiteUrl } from './site-origin.mts'

describe('site origin helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses SITE_ORIGIN before falling back to the public origin', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://app.example.test')
    vi.stubEnv('NEXT_PUBLIC_SITE_ORIGIN', 'https://public.example.test')

    expect(getSiteOrigin()).toBe('https://app.example.test')
    expect(getSiteUrl('/my/notification-settings')).toBe(
      'https://app.example.test/my/notification-settings',
    )
  })

  it('falls back to NEXT_PUBLIC_SITE_ORIGIN, sitemap origin, and then production', () => {
    vi.stubEnv('SITE_ORIGIN', undefined)
    vi.stubEnv('NEXT_PUBLIC_SITE_ORIGIN', 'https://public.example.test')
    vi.stubEnv('SITEMAP_BASE_URL', 'https://sitemap.example.test')

    expect(getSiteOrigin()).toBe('https://public.example.test')

    vi.stubEnv('NEXT_PUBLIC_SITE_ORIGIN', undefined)
    vi.stubEnv('SITEMAP_BASE_URL', 'https://sitemap.example.test')

    expect(getSiteOrigin()).toBe('https://sitemap.example.test')

    vi.stubEnv('SITEMAP_BASE_URL', undefined)

    expect(getSiteOrigin()).toBe('https://voucha.ai')
  })
})
