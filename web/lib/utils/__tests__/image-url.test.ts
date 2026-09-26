import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlacementImageUrl } from '../image-url'

describe('getPlacementImageUrl deployment behavior', () => {
  beforeEach(() => {
    delete process.env.IMAGE_ORIGIN
    delete (globalThis as { window?: { __IMAGE_ORIGIN__?: string } }).window
  })

  afterEach(() => {
    delete (globalThis as { window?: { __IMAGE_ORIGIN__?: string } }).window
    vi.unstubAllEnvs()
  })

  it('fails closed for deployed production when IMAGE_ORIGIN is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'production')
    expect(() => getPlacementImageUrl('placement-123', 0, 'test.jpg', { width: 400 })).toThrow(
      'IMAGE_ORIGIN',
    )
  })

  it('fails closed for deployed production even when CI is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'production')
    vi.stubEnv('CI', 'true')
    expect(() => getPlacementImageUrl('placement-123', 0, 'test.jpg', { width: 400 })).toThrow(
      'IMAGE_ORIGIN',
    )
  })

  it('preserves relative URLs for local production-mode startup', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(getPlacementImageUrl('placement-123', 0, 'test.jpg', { width: 400 })).toBe(
      '/images/placements/placement-123/0/test.jpg?w=400',
    )
  })
})
