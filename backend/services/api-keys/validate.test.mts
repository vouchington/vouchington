import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey'
import { createTestUser } from '@voucha/test-helpers'
import { setTestApiKeyPermissions } from '@voucha/test-helpers/entities/api-keys'
import { ValkeyBloomFilter } from 'valkyries/bloom-filter'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createApiKey } from './create.mts'
import { hashApiKey } from './generate.mts'
import { revokeApiKey } from './revoke.mts'
import { validateApiKey, validateApiKeyForMcpAudience } from './validate.mts'

const unexpectedBloomClientCommands: string[] = []

describe('validate', () => {
  let restoreBloomConfig: (() => void) | undefined

  beforeAll(() => {
    unexpectedBloomClientCommands.length = 0
    vi.spyOn(ValkeyBloomFilter.prototype, 'addOrThrow').mockResolvedValue(undefined)
    vi.spyOn(ValkeyBloomFilter.prototype, 'existsIfReady').mockResolvedValue(true)

    for (const method of ['invokeScript', 'customCommand', 'rename', 'set', 'unlink'] as const) {
      vi.spyOn(bloomValkeyClient, method).mockImplementation(async () => {
        unexpectedBloomClientCommands.push(method)
        throw new Error(`Unexpected API-key Bloom client command: ${method}`)
      })
    }

    restoreBloomConfig = overrideDynamicConfigFieldsForTest(bloomFilterConfig, {
      apiKeyBloomFilterEnabled: true,
    })
    process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
  })

  afterAll(() => {
    try {
      if (unexpectedBloomClientCommands.length > 0) {
        throw new Error(
          `Unexpected API-key Bloom client commands: ${unexpectedBloomClientCommands.join(', ')}`,
        )
      }
    } finally {
      restoreBloomConfig?.()
      vi.restoreAllMocks()
    }
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

    it('rejects an unknown scope at the database boundary', async () => {
      const user = await createTestUser()
      const { apiKey } = await createApiKey(user.id, 'rss', 'Unknown stored scope', ['rss:read'])
      await expect(setTestApiKeyPermissions(apiKey.id, ['unknown:read'])).rejects.toMatchObject({
        code: '22P02',
      })
    })

    it.each([
      ['wrong surface', ['rss:read', 'mcp.admin:read']],
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

  describe('validateApiKeyForMcpAudience', () => {
    it('rejects a key whose stored scopes were tampered into the admin audience', async () => {
      const user = await createTestUser({ administrator: true })
      const { rawKey, apiKey } = await createApiKey(
        user.id,
        'mcp',
        `MCP tampered ${Math.random().toString(36).slice(2, 8)}`,
        ['mcp.user:read'],
      )
      await setTestApiKeyPermissions(apiKey.id, ['mcp.admin:read'])

      await expect(validateApiKeyForMcpAudience(rawKey, 'user')).resolves.toEqual({ valid: false })
    })

    it('binds a community moderation key to that server', async () => {
      const user = await createTestUser()
      const { rawKey } = await createApiKey(user.id, 'mcp', 'Moderation key', [
        'community-moderation:read',
      ])
      await expect(
        validateApiKeyForMcpAudience(rawKey, 'community_moderation'),
      ).resolves.toMatchObject({
        valid: true,
      })
      await expect(validateApiKeyForMcpAudience(rawKey, 'user')).resolves.toEqual({ valid: false })
    })

    it('uses a Bloom hit, rejects a definite miss, and falls back to Postgres after a probe error', async () => {
      const existsIfReady = vi.mocked(ValkeyBloomFilter.prototype.existsIfReady)
      const addOrThrow = vi.mocked(ValkeyBloomFilter.prototype.addOrThrow)
      const probeCallOffset = existsIfReady.mock.calls.length
      const addCallOffset = addOrThrow.mock.calls.length
      const probeError = new Error('owned Bloom probe failure')
      existsIfReady
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(probeError)

      const user = await createTestUser()
      const { rawKey, apiKey } = await createApiKey(
        user.id,
        'mcp',
        `MCP Bloom fallback ${crypto.randomUUID()}`,
        ['mcp.user:read'],
      )
      const keyHash = hashApiKey(rawKey).toString('hex')

      await expect(validateApiKeyForMcpAudience(rawKey, 'user')).resolves.toMatchObject({
        valid: true,
        apiKey: { id: apiKey.id, permissions: ['mcp.user:read'] },
      })
      await expect(validateApiKeyForMcpAudience(rawKey, 'user')).resolves.toEqual({ valid: false })
      await expect(validateApiKeyForMcpAudience(rawKey, 'user')).resolves.toMatchObject({
        valid: true,
        apiKey: { id: apiKey.id, permissions: ['mcp.user:read'] },
      })

      expect(addOrThrow.mock.calls.slice(addCallOffset)).toEqual([[[keyHash]]])
      expect(existsIfReady.mock.calls.slice(probeCallOffset)).toEqual([
        ['bloom-filter:api-keys:ready', keyHash],
        ['bloom-filter:api-keys:ready', keyHash],
        ['bloom-filter:api-keys:ready', keyHash],
      ])
      expect(unexpectedBloomClientCommands).toEqual([])
    })
  })
})
