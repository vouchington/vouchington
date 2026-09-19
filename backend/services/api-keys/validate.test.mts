import { beforeAll, describe, it, expect } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { setTestApiKeyPermissions } from '@voucha/test-helpers/entities/api-keys'
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
        ['rss:read'],
      )
      const result = await validateApiKey(rawKey, 'rss:read')
      expect(result.valid).toBe(true)
      expect(result.apiKey).toBeDefined()
    })

    it('malformed key (no voucha_ prefix) → { valid: false }', async () => {
      const result = await validateApiKey('not-a-valid-key', 'rss:read')
      expect(result.valid).toBe(false)
      expect(result.apiKey).toBeUndefined()
    })

    it('wrong checksum → { valid: false }', async () => {
      // valid format but bad checksum
      const fakeKey = `voucha_rss_${'a'.repeat(32)}_${'b'.repeat(16)}`
      const result = await validateApiKey(fakeKey, 'rss:read')
      expect(result.valid).toBe(false)
    })

    it('revoked key → { valid: false }', async () => {
      const user = await createTestUser()
      const { rawKey, apiKey } = await createApiKey(
        user.id,
        'rss',
        `Revoke Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss:read'],
      )
      await revokeApiKey(user.id, apiKey.id)
      const result = await validateApiKey(rawKey, 'rss:read')
      expect(result.valid).toBe(false)
    })

    it('wrong permission → { valid: false }', async () => {
      const user = await createTestUser()
      const { rawKey } = await createApiKey(
        user.id,
        'rss',
        `Perm Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss:read'],
      )
      const result = await validateApiKey(rawKey, 'mcp.admin:write')
      expect(result.valid).toBe(false)
    })

    it('different required permission → { valid: false }', async () => {
      const user = await createTestUser()
      // Create an RSS key, then require a valid scope from a different resource.
      const { rawKey } = await createApiKey(
        user.id,
        'rss',
        `Empty Perm Test ${Math.random().toString(36).slice(2, 8)}`,
        ['rss:read'],
      )
      const result = await validateApiKey(rawKey, 'mcp.user:read')
      expect(result.valid).toBe(false)
    })

    it.each([
      ['unknown', ['rss:read', 'unknown:read']],
      ['duplicate', ['rss:read', 'rss:read']],
    ])('fails closed on a %s persisted scope set', async (_name, permissions) => {
      const user = await createTestUser()
      const { rawKey, apiKey } = await createApiKey(user.id, 'rss', 'Malformed stored scopes', [
        'rss:read',
      ])
      try {
        await setTestApiKeyPermissions(apiKey.id, permissions)

        await expect(validateApiKey(rawKey, 'rss:read')).resolves.toEqual({ valid: false })
      } finally {
        await setTestApiKeyPermissions(apiKey.id, ['rss:read'])
      }
    })
  })
})
