import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROBOTS_DISALLOW_PREFIXES } from '@ts-shared/route-classification'
import robots from './robots'

describe('robots', () => {
  beforeEach(() => {
    // Unset env vars the module reads so each test starts from a known state.
    vi.stubEnv('NEXT_PUBLIC_NOINDEX', '')
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '')
    vi.stubEnv('SITEMAP_BASE_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('disallows all crawlers when NEXT_PUBLIC_NOINDEX is true', () => {
    vi.stubEnv('NEXT_PUBLIC_NOINDEX', 'true')
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } })
  })

  it('allows crawlers and includes sitemap when NEXT_PUBLIC_NOINDEX is not set', () => {
    const result = robots()
    expect(result).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: [...ROBOTS_DISALLOW_PREFIXES] },
      sitemap: 'https://voucha.ai/sitemap.xml',
    })
  })

  it('uses NEXT_PUBLIC_API_BASE_URL for sitemap when set', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://staging.voucha.ai')
    const result = robots()
    expect(result).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: [...ROBOTS_DISALLOW_PREFIXES] },
      sitemap: 'https://staging.voucha.ai/sitemap.xml',
    })
  })
})
