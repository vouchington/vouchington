import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getImageOrigin,
  getSideloadImageUrlPrefix,
  validateRuntimeImageOrigin,
} from './image-origin.mts'

describe('image origin', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('normalizes IMAGE_ORIGIN to a pure URL origin', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com:8443/')
    expect(getImageOrigin()).toBe('https://images.example.com:8443')
    expect(getSideloadImageUrlPrefix()).toBe('https://images.example.com:8443/sideload/')
  })

  it.each([
    'images.example.com',
    'ftp://images.example.com',
    'https://user:pass@images.example.com',
    'https://images.example.com/path',
    'https://images.example.com?query=yes',
    'https://images.example.com#fragment',
  ])('rejects an invalid IMAGE_ORIGIN: %s', imageOrigin => {
    vi.stubEnv('IMAGE_ORIGIN', imageOrigin)
    expect(() => getImageOrigin()).toThrow('IMAGE_ORIGIN')
  })

  it('fails closed when IMAGE_ORIGIN is missing in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    vi.stubEnv('IMAGE_LAMBDA_PORT', '3003')
    expect(() => getImageOrigin()).toThrow('IMAGE_ORIGIN')
  })

  it('fails closed when IMAGE_ORIGIN is missing on staging, even though NODE_ENV=production there too', () => {
    // ECS sets NODE_ENV=production on every task, staging included. The guard must key off
    // ENVIRONMENT=staging, not only NODE_ENV=production, or staging would silently fall through
    // to the localhost fallback below.
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    vi.stubEnv('IMAGE_LAMBDA_PORT', '3003')
    expect(() => getImageOrigin()).toThrow('IMAGE_ORIGIN')
  })

  it('validates IMAGE_ORIGIN during production runtime startup', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NODE_PREWARM', undefined)
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    expect(() => validateRuntimeImageOrigin()).toThrow('IMAGE_ORIGIN')
  })

  it('skips runtime-only IMAGE_ORIGIN validation during production prewarm', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NODE_PREWARM', '1')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    expect(() => validateRuntimeImageOrigin()).not.toThrow()
  })

  it('does not treat a false-like prewarm value as the Docker build sentinel', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NODE_PREWARM', '0')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    expect(() => validateRuntimeImageOrigin()).toThrow('IMAGE_ORIGIN')
  })

  it('derives a localhost image origin from IMAGE_LAMBDA_PORT outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    vi.stubEnv('IMAGE_LAMBDA_PORT', '3003')
    expect(getImageOrigin()).toBe('http://localhost:3003')
  })

  it('fails instead of falling back to the site origin', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('IMAGE_ORIGIN', undefined)
    vi.stubEnv('IMAGE_LAMBDA_PORT', undefined)
    vi.stubEnv('SITEMAP_BASE_URL', 'https://voucha.ai')
    expect(() => getImageOrigin()).toThrow('IMAGE_ORIGIN')
  })
})
