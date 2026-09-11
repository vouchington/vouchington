import { afterEach, beforeEach, expect, it, vi, describe } from 'vitest'
import { getImageUrl, getPublicImageUrl } from './url.mts'

describe('url.generated', () => {
  beforeEach(() => {
    vi.stubEnv('IMAGE_ORIGIN', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('getImageUrl - uses IMAGE_ORIGIN when configured', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com/')
    vi.stubEnv('NODE_ENV', 'development')

    const url = getImageUrl('01936f8e-8b2a-7890-a456-123456789012')

    expect(url).toBe(
      'https://images.example.com/images/01936f8e-8b2a-7890-a456-123456789012?w=1200',
    )
  })

  it('getImageUrl - uses local image lambda port in dev and test', () => {
    vi.stubEnv('IMAGE_LAMBDA_PORT', '3903')
    vi.stubEnv('NODE_ENV', 'test')

    const url = getImageUrl('abcdef0123456789')

    expect(url).toBe('http://localhost:3903/images/abcdef0123456789?w=1200')
  })

  it('getImageUrl - supports explicit width', () => {
    vi.stubEnv('IMAGE_LAMBDA_PORT', '3903')
    vi.stubEnv('NODE_ENV', 'test')

    const url = getImageUrl('abcdef0123456789', 400)

    expect(url).toBe('http://localhost:3903/images/abcdef0123456789?w=400')
  })

  it('getImageUrl - uses IMAGE_ORIGIN in production', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('NODE_ENV', 'production')

    const url = getImageUrl('abcdef0123456789')

    expect(url).toBe('https://images.example.com/images/abcdef0123456789?w=1200')
  })

  it('getImageUrl - rejects a missing origin instead of falling back to SITEMAP_BASE_URL', () => {
    vi.stubEnv('IMAGE_ORIGIN', '')
    vi.stubEnv('IMAGE_LAMBDA_PORT', '')
    vi.stubEnv('SITEMAP_BASE_URL', 'https://staging.voucha.ai/')
    vi.stubEnv('NODE_ENV', 'development')

    expect(() => getImageUrl('abcdef0123456789')).toThrow('IMAGE_ORIGIN')
  })

  it('getImageUrl - rejects a missing origin instead of falling back to the public site', () => {
    vi.stubEnv('IMAGE_ORIGIN', '')
    vi.stubEnv('IMAGE_LAMBDA_PORT', '')
    vi.stubEnv('SITEMAP_BASE_URL', '')
    vi.stubEnv('NODE_ENV', 'development')

    expect(() => getImageUrl('abcdef0123456789')).toThrow('IMAGE_ORIGIN')
  })

  it('getImageUrl - rejects a stringified missing origin env', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'undefined')
    vi.stubEnv('IMAGE_LAMBDA_PORT', '')
    vi.stubEnv('SITEMAP_BASE_URL', 'undefined')
    vi.stubEnv('NODE_ENV', 'development')

    expect(() => getImageUrl('abcdef0123456789')).toThrow('IMAGE_ORIGIN')
  })

  describe('getPublicImageUrl', () => {
    it('returns the URL when the image origin is a public FQDN', () => {
      vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')

      const url = getPublicImageUrl('abcdef0123456789')

      expect(url).toBe('https://images.example.com/images/abcdef0123456789?w=1200')
    })

    it('returns the URL with an explicit width when the origin is public', () => {
      vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')

      const url = getPublicImageUrl('abcdef0123456789', 400)

      expect(url).toBe('https://images.example.com/images/abcdef0123456789?w=400')
    })

    it('returns null when the origin is localhost (IMAGE_LAMBDA_PORT)', () => {
      vi.stubEnv('IMAGE_LAMBDA_PORT', '3903')
      vi.stubEnv('IMAGE_ORIGIN', '')

      const url = getPublicImageUrl('abcdef0123456789')

      expect(url).toBeNull()
    })

    it('returns null when the origin is a .local hostname', () => {
      vi.stubEnv('IMAGE_ORIGIN', 'http://images.local')
      vi.stubEnv('IMAGE_LAMBDA_PORT', '')

      const url = getPublicImageUrl('abcdef0123456789')

      expect(url).toBeNull()
    })

    it('returns null when the configured origin is missing its protocol', () => {
      vi.stubEnv('IMAGE_ORIGIN', 'images.example.com')
      vi.stubEnv('IMAGE_LAMBDA_PORT', '')

      expect(() => getPublicImageUrl('abcdef0123456789')).toThrow('IMAGE_ORIGIN')
    })
  })
})
