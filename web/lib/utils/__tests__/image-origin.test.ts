import { afterEach, describe, expect, it, vi } from 'vitest'
import { getImageOrigin, normalizeImageOrigin } from '../image-origin'

describe('image origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as { window?: unknown }).window
  })

  it('normalizes a trailing slash', () => {
    expect(normalizeImageOrigin('https://images.example.com/')).toBe('https://images.example.com')
  })

  it.each([
    'images.example.com',
    'ftp://images.example.com',
    'https://user:pass@images.example.com',
    'https://images.example.com/path',
    'https://images.example.com?query=yes',
    'https://images.example.com#fragment',
  ])('rejects an invalid origin: %s', origin => {
    expect(() => normalizeImageOrigin(origin)).toThrow('IMAGE_ORIGIN')
  })

  it('fails closed when deployed staging is missing IMAGE_ORIGIN', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    expect(() => getImageOrigin()).toThrow('IMAGE_ORIGIN')
  })

  it('fails closed on ENVIRONMENT alone, regardless of NODE_ENV', () => {
    // ECS sets NODE_ENV="production" unconditionally on every task; ENVIRONMENT is the only
    // signal that actually distinguishes a deployed target from a developer's local build.
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    expect(() => getImageOrigin()).toThrow('IMAGE_ORIGIN')
  })

  it('preserves a missing-origin fallback for local and test environments', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    expect(getImageOrigin()).toBeUndefined()
  })

  it('normalizes the browser bootstrap value', () => {
    ;(globalThis as { window?: unknown }).window = {
      __IMAGE_ORIGIN__: 'http://localhost:9100/',
    }
    expect(getImageOrigin()).toBe('http://localhost:9100')
  })
})
