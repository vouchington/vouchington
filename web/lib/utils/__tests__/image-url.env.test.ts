import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPlacementImagePath, getImageUrl, getPlacementImageUrl } from '../image-url'

describe('getImageUrl', () => {
  const originalImageOrigin = process.env.IMAGE_ORIGIN

  beforeEach(() => {
    delete process.env.IMAGE_ORIGIN
    delete (globalThis as { window?: { __IMAGE_ORIGIN__?: string } }).window
    // The unit suite runs with NODE_ENV=test by default; pin it explicitly so
    // the host-resolution tests below exercise the dev/test fallback path
    // regardless of how the runner was invoked.
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(() => {
    if (originalImageOrigin === undefined) {
      delete process.env.IMAGE_ORIGIN
    } else {
      process.env.IMAGE_ORIGIN = originalImageOrigin
    }
    delete (globalThis as { window?: { __IMAGE_ORIGIN__?: string } }).window
    // unstubAllEnvs restores NODE_ENV (and any other stubs) to the value
    // Vitest captured at process startup.
    vi.unstubAllEnvs()
  })

  it('appends width param', () => {
    const url = getImageUrl('abc123', { width: 400 })
    expect(url).toContain('?w=400')
  })

  it('appends quality param', () => {
    const url = getImageUrl('abc123', { width: 400, quality: 80 })
    expect(url).toContain('q=80')
  })

  it('appends both width and quality', () => {
    const url = getImageUrl('abc123', { width: 200, quality: 75 })
    expect(url).toContain('w=200')
    expect(url).toContain('q=75')
  })

  it('uses the imageId in the URL path', () => {
    const imageId = '01927abc-def0-7000-1234-56789abcdef0'
    const url = getImageUrl(imageId, { width: 400 })
    expect(url).toContain(imageId)
  })

  it('uses the placement delivery route, including revision zero', () => {
    expect(getPlacementImageUrl('placement-123', 0, 'image-456', { width: 400 })).toBe(
      '/images/placements/placement-123/0/image-456?w=400',
    )
  })

  it('builds a placement path from a persisted image object', () => {
    expect(
      buildPlacementImagePath({
        image_id: 'image-456',
        placement_id: 'placement-123',
        placement_revision: 0,
      }),
    ).toBe('/images/placements/placement-123/0/image-456?w=1200')
  })

  it('omits a placement path when the image is absent', () => {
    expect(buildPlacementImagePath(null)).toBeUndefined()
    expect(buildPlacementImagePath()).toBeUndefined()
  })

  it('returns a relative /images/{id}?w=... URL when no host is configured (local dev)', () => {
    const url = getImageUrl('test.jpg', { width: 400 })
    expect(url).toBe('/images/test.jpg?w=400')
  })

  it('uses IMAGE_ORIGIN as the runtime origin (server-side)', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.voucha.ai')
    const url = getImageUrl('test.jpg', { width: 400, quality: 75 })
    expect(url).toBe('https://images.voucha.ai/images/test.jpg?w=400&q=75')
  })

  it('reads window.__IMAGE_ORIGIN__ when present (client-side)', () => {
    ;(globalThis as { window?: { __IMAGE_ORIGIN__?: string } }).window = {
      __IMAGE_ORIGIN__: 'https://images-staging.voucha.ai',
    }
    const url = getImageUrl('test.jpg', { width: 400 })
    expect(url).toBe('https://images-staging.voucha.ai/images/test.jpg?w=400')
  })

  it('window.__IMAGE_ORIGIN__ takes precedence over IMAGE_ORIGIN', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.voucha.ai')
    ;(globalThis as { window?: { __IMAGE_ORIGIN__?: string } }).window = {
      __IMAGE_ORIGIN__: 'http://localhost:9100',
    }
    const url = getImageUrl('test.jpg', { width: 400 })
    expect(url).toBe('http://localhost:9100/images/test.jpg?w=400')
  })

  it('throws when deployed production has no host configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'production')
    expect(() => getImageUrl('test.jpg', { width: 400 })).toThrow('IMAGE_ORIGIN')
  })

  it('does not throw when NODE_ENV=production and IMAGE_ORIGIN is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    const url = getImageUrl('test.jpg', { width: 400 })
    expect(url).toBe('https://images.example.com/images/test.jpg?w=400')
  })

  it('does not throw when NODE_ENV=production and window.__IMAGE_ORIGIN__ is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    ;(globalThis as { window?: { __IMAGE_ORIGIN__?: string } }).window = {
      __IMAGE_ORIGIN__: 'https://images.voucha.ai',
    }
    const url = getImageUrl('test.jpg', { width: 400 })
    expect(url).toBe('https://images.voucha.ai/images/test.jpg?w=400')
  })
})
