import { describe, it, expect } from 'vitest'
import { buildCacheKey } from './key.mts'
import { CACHE_VERSION } from '../config.mts'

describe('buildCacheKey', () => {
  it('encodes dimensions, flags, format, version, and the full source path', () => {
    const key = buildCacheKey({
      key: 'users/123/profile/avatar.jpg',
      width: 800,
      height: 600,
      quality: 85,
      lossless: false,
      progressive: true,
      format: 'webp',
    })

    expect(key).toBe(`users/123/profile/avatar.jpg--w800-h600-l0-p1-q85-fwebp-v${CACHE_VERSION}`)
  })

  it('omits absent height and encodes the opposite flag values', () => {
    const key = buildCacheKey({
      key: 'images/test.jpg',
      width: 800,
      quality: 75,
      lossless: true,
      progressive: false,
      format: 'jpeg',
    })

    expect(key).toBe(`images/test.jpg--w800-l1-p0-q75-fjpeg-v${CACHE_VERSION}`)
  })
})
