import { beforeAll, describe, it, expect } from 'vitest'
import { computeApiKeyChecksum, validateApiKeyChecksum } from './checksum.mts'
import { formatApiKey, BRAND_PREFIX } from './format.mts'

describe('checksum', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
  })

  describe('computeApiKeyChecksum', () => {
    it('is deterministic (same input → same output)', () => {
      const payload = `${BRAND_PREFIX}rss_${'a'.repeat(32)}`
      const first = computeApiKeyChecksum(payload)
      const second = computeApiKeyChecksum(payload)
      expect(first).toBe(second)
    })

    it('returns exactly 16 hex chars', () => {
      const payload = `${BRAND_PREFIX}rss_${'b'.repeat(32)}`
      const checksum = computeApiKeyChecksum(payload)
      expect(checksum).toMatch(/^[0-9a-f]{16}$/)
    })

    it('produces different outputs for different inputs', () => {
      const a = computeApiKeyChecksum(`${BRAND_PREFIX}rss_${'a'.repeat(32)}`)
      const b = computeApiKeyChecksum(`${BRAND_PREFIX}rss_${'b'.repeat(32)}`)
      expect(a).not.toBe(b)
    })
  })

  describe('validateApiKeyChecksum', () => {
    it('returns true for a correctly generated key', () => {
      const random = 'c'.repeat(32)
      const payload = `${BRAND_PREFIX}rss_${random}`
      const checksum = computeApiKeyChecksum(payload)
      const rawKey = formatApiKey('rss', random, checksum)
      expect(validateApiKeyChecksum(rawKey)).toBe(true)
    })

    it('returns false for tampered random', () => {
      const random = 'd'.repeat(32)
      const payload = `${BRAND_PREFIX}rss_${random}`
      const checksum = computeApiKeyChecksum(payload)
      const tamperedRandom = 'e'.repeat(32)
      const rawKey = formatApiKey('rss', tamperedRandom, checksum)
      expect(validateApiKeyChecksum(rawKey)).toBe(false)
    })

    it('returns false for tampered checksum', () => {
      const random = 'f'.repeat(32)
      const payload = `${BRAND_PREFIX}rss_${random}`
      const validChecksum = computeApiKeyChecksum(payload)
      // flip first char
      const tamperedChecksum = (validChecksum[0] === 'a' ? 'b' : 'a') + validChecksum.slice(1)
      const rawKey = formatApiKey('rss', random, tamperedChecksum)
      expect(validateApiKeyChecksum(rawKey)).toBe(false)
    })

    it('returns false for structurally invalid key', () => {
      expect(validateApiKeyChecksum('not-a-valid-key')).toBe(false)
      expect(validateApiKeyChecksum('')).toBe(false)
    })
  })
})
