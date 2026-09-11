import { describe, it, expect } from 'vitest'
import { buildCacheKey } from './key.mts'
import { CACHE_VERSION } from '../config.mts'

describe('buildCacheKey', () => {
  it('should build cache key with all parameters', () => {
    const key = buildCacheKey({
      key: 'images/test.jpg',
      width: 800,
      height: 600,
      quality: 85,
      lossless: false,
      progressive: true,
      format: 'webp',
    })

    expect(key).toBe(`images/test.jpg--w800-h600-l0-p1-q85-fwebp-v${CACHE_VERSION}`)
  })

  it('should build cache key without height', () => {
    const key = buildCacheKey({
      key: 'images/test.jpg',
      width: 800,
      quality: 75,
      lossless: false,
      progressive: false,
      format: 'jpeg',
    })

    expect(key).toBe(`images/test.jpg--w800-l0-p0-q75-fjpeg-v${CACHE_VERSION}`)
  })

  it('should include lossless flag when true', () => {
    const key = buildCacheKey({
      key: 'test.png',
      width: 400,
      quality: 100,
      lossless: true,
      progressive: false,
      format: 'png',
    })

    expect(key).toBe(`test.png--w400-l1-p0-q100-fpng-v${CACHE_VERSION}`)
  })

  it('should include progressive flag when true', () => {
    const key = buildCacheKey({
      key: 'test.jpg',
      width: 1200,
      quality: 90,
      lossless: false,
      progressive: true,
      format: 'jpeg',
    })

    expect(key).toBe(`test.jpg--w1200-l0-p1-q90-fjpeg-v${CACHE_VERSION}`)
  })

  it('should handle AVIF format', () => {
    const key = buildCacheKey({
      key: 'photo.jpg',
      width: 600,
      quality: 80,
      lossless: false,
      progressive: false,
      format: 'avif',
    })

    expect(key).toBe(`photo.jpg--w600-l0-p0-q80-favif-v${CACHE_VERSION}`)
  })

  it('should include cache version suffix', () => {
    const key = buildCacheKey({
      key: 'test.jpg',
      width: 100,
      quality: 75,
      lossless: false,
      progressive: false,
      format: 'jpeg',
    })

    expect(key).toContain(`-v${CACHE_VERSION}`)
    expect(key).toMatch(/-v.+$/)
  })

  it('should preserve key path separators', () => {
    const key = buildCacheKey({
      key: 'users/123/profile/avatar.jpg',
      width: 200,
      quality: 75,
      lossless: false,
      progressive: false,
      format: 'jpeg',
    })

    expect(key).toContain('users/123/profile/avatar.jpg')
    expect(key).toBe(`users/123/profile/avatar.jpg--w200-l0-p0-q75-fjpeg-v${CACHE_VERSION}`)
  })
})
