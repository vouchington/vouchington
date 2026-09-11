import { beforeAll, describe, it, expect } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from './create.mts'
import { revokeApiKey } from './revoke.mts'
import { validateApiKey } from './validate.mts'

describe('validate', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
  })

  describe('validateApiKey', () => {
    it('happy path: createApiKey then validateApiKey → valid', async () => {
      const user = await createTestUser()
      const { rawKey } = await createApiKey(
        user.id,
        'rss',
        `Validate Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss-feeds:read'],
      )
      const result = await validateApiKey(rawKey, 'rss-feeds:read')
      expect(result.valid).toBe(true)
      expect(result.apiKey).toBeDefined()
    })

    it('malformed key (no voucha_ prefix) → { valid: false }', async () => {
      const result = await validateApiKey('not-a-valid-key', 'rss-feeds:read')
      expect(result.valid).toBe(false)
      expect(result.apiKey).toBeUndefined()
    })

    it('wrong checksum → { valid: false }', async () => {
      // valid format but bad checksum
      const fakeKey = `voucha_rss_${'a'.repeat(32)}_${'b'.repeat(16)}`
      const result = await validateApiKey(fakeKey, 'rss-feeds:read')
      expect(result.valid).toBe(false)
    })

    it('revoked key → { valid: false }', async () => {
      const user = await createTestUser()
      const { rawKey, apiKey } = await createApiKey(
        user.id,
        'rss',
        `Revoke Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss-feeds:read'],
      )
      await revokeApiKey(user.id, apiKey.id)
      const result = await validateApiKey(rawKey, 'rss-feeds:read')
      expect(result.valid).toBe(false)
    })

    it('wrong permission → { valid: false }', async () => {
      const user = await createTestUser()
      const { rawKey } = await createApiKey(
        user.id,
        'rss',
        `Perm Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss-feeds:read'],
      )
      const result = await validateApiKey(rawKey, 'admin:write')
      expect(result.valid).toBe(false)
    })

    it('different required permission → { valid: false }', async () => {
      const user = await createTestUser()
      // Create key with rss-feeds:read, try to validate with different permission
      const { rawKey } = await createApiKey(
        user.id,
        'rss',
        `Empty Perm Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss-feeds:read'],
      )
      const result = await validateApiKey(rawKey, 'other:permission')
      expect(result.valid).toBe(false)
    })
  })
})
