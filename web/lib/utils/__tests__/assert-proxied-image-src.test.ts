import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertProxiedImageSrc, isSideloadImageSrc } from '../assert-proxied-image-src'

describe('assertProxiedImageSrc', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    delete (globalThis as { window?: unknown }).window
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as { window?: unknown }).window
  })

  it('allows relative paths', () => {
    expect(() => assertProxiedImageSrc('/images/foo.png')).not.toThrow()
    expect(() => assertProxiedImageSrc('/sideload/abc?w=400')).not.toThrow()
  })

  it('allows data: URLs', () => {
    expect(() => assertProxiedImageSrc('data:image/png;base64,abc')).not.toThrow()
  })

  it('allows empty string', () => {
    expect(() => assertProxiedImageSrc('')).not.toThrow()
  })

  it('throws for raw external http URL in dev', () => {
    expect(() => assertProxiedImageSrc('http://example.com/img.png')).toThrow('/sideload/')
  })

  it('throws for raw external https URL in dev', () => {
    expect(() => assertProxiedImageSrc('https://example.com/img.png')).toThrow('/sideload/')
  })

  it('throws for protocol-relative URL (// prefix) in dev', () => {
    expect(() => assertProxiedImageSrc('//example.com/img.png')).toThrow('/sideload/')
  })

  it('allows https URL that starts with IMAGE_ORIGIN env var', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://cdn.example.com')
    expect(() => assertProxiedImageSrc('https://cdn.example.com/images/foo.jpg')).not.toThrow()
  })

  it('rejects a lookalike hostname that only starts with IMAGE_ORIGIN', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.voucha.ai')
    expect(() =>
      assertProxiedImageSrc('https://images.voucha.ai.evil.example/sideload/abc'),
    ).toThrow('/sideload/')
  })

  it('recognizes only relative or exact-origin sideload URLs', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.voucha.ai')
    expect(isSideloadImageSrc('/sideload/abc?sig=test')).toBe(true)
    expect(isSideloadImageSrc('https://images.voucha.ai/sideload/abc?sig=test')).toBe(true)
    expect(isSideloadImageSrc('https://images.voucha.ai/images/abc?w=400')).toBe(false)
    expect(isSideloadImageSrc('https://images.voucha.ai.evil.example/sideload/abc')).toBe(false)
  })

  it('throws for https URL that does not match IMAGE_ORIGIN', () => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://cdn.example.com')
    expect(() => assertProxiedImageSrc('https://other.example.com/img.png')).toThrow('/sideload/')
  })

  it('allows https URL from window.__IMAGE_ORIGIN__ in browser context', () => {
    ;(globalThis as { window?: unknown }).window = {
      __IMAGE_ORIGIN__: 'https://cdn.example.com',
    }
    expect(() => assertProxiedImageSrc('https://cdn.example.com/images/foo.jpg')).not.toThrow()
  })

  it('does not throw in production regardless of URL', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => assertProxiedImageSrc('https://any-external.com/img.png')).not.toThrow()
  })

  it('does not throw in storybook browser mode (VITEST_STORYBOOK_BROWSER=1)', () => {
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', '1')
    expect(() => assertProxiedImageSrc('https://any-fixture.example.com/img.png')).not.toThrow()
  })
})
