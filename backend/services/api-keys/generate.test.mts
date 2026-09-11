import { beforeAll, describe, it, expect } from 'vitest'
import { generateApiKey, hashApiKey } from './generate.mts'
import { parseApiKey, BRAND_PREFIX } from './format.mts'
import { validateApiKeyChecksum } from './checksum.mts'

describe('generate', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
  })

  describe('generateApiKey', () => {
    it('emitted key matches expected format', () => {
      const { rawKey } = generateApiKey('rss')
      expect(rawKey).toMatch(/^voucha_rss_[0-9a-f]{32}_[0-9a-f]{16}$/)
    })

    it('parseApiKey succeeds and type === rss', () => {
      const { rawKey } = generateApiKey('rss')
      const parsed = parseApiKey(rawKey)
      expect(parsed).not.toBeNull()
      expect(parsed!.type).toBe('rss')
    })

    it('validateApiKeyChecksum returns true for generated key', () => {
      const { rawKey } = generateApiKey('rss')
      expect(validateApiKeyChecksum(rawKey)).toBe(true)
    })

    it('hashApiKey returns a 32-byte Buffer', () => {
      const { rawKey } = generateApiKey('rss')
      const hash = hashApiKey(rawKey)
      expect(hash).toBeInstanceOf(Buffer)
      expect(hash.length).toBe(32)
    })

    it('prefix is voucha_rss_ + first 4 hex chars of random', () => {
      const { rawKey, prefix } = generateApiKey('rss')
      const parsed = parseApiKey(rawKey)
      expect(parsed).not.toBeNull()
      const expectedPrefix = `${BRAND_PREFIX}rss_${parsed!.random.slice(0, 4)}`
      expect(prefix).toBe(expectedPrefix)
    })

    it('generates unique keys on each call', () => {
      const { rawKey: key1 } = generateApiKey('rss')
      const { rawKey: key2 } = generateApiKey('rss')
      expect(key1).not.toBe(key2)
    })
  })
})
