import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getImageUrl } from '../image-url'

describe('getImageUrl deployment behavior', () => {
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
    expect(() => getImageUrl('test.jpg', { width: 400 })).toThrow('IMAGE_ORIGIN')
  })

  it('fails closed for deployed production even when CI is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'production')
    vi.stubEnv('CI', 'true')
    expect(() => getImageUrl('test.jpg', { width: 400 })).toThrow('IMAGE_ORIGIN')
  })

  it('preserves relative URLs for local production-mode startup', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(getImageUrl('test.jpg', { width: 400 })).toBe('/images/test.jpg?w=400')
  })
})
