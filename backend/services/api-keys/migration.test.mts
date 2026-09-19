import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  attemptInvalidTestApiKeyScopeMigration,
  migrateTestApiKeyScopeRows,
} from '@voucha/test-helpers/entities/api-keys'
import { createApiKey } from './create.mts'

describe('API-key canonical scope migration', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
  })

  it('maps legacy scope arrays in canonical order independent of input order', async () => {
    await expect(
      migrateTestApiKeyScopeRows([
        { id: 1, type: 'rss', permissions: ['rss-feeds:read'] },
        { id: 2, type: 'mcp', permissions: ['mcp-tools:write', 'mcp-tools:read'] },
        {
          id: 3,
          type: 'mcp',
          permissions: ['mcp-admin-tools:write', 'mcp-admin-tools:read'],
        },
      ]),
    ).resolves.toEqual([
      { id: '1', permissions: ['rss:read'] },
      { id: '2', permissions: ['mcp.user:read', 'mcp.user:write'] },
      { id: '3', permissions: ['mcp.admin:read', 'mcp.admin:write'] },
    ])
  })

  it.each([
    ['unknown', ['mcp-tools:read', 'unknown:read']],
    ['mixed audience', ['mcp-tools:read', 'mcp-admin-tools:read']],
    ['duplicate alias', ['mcp-tools:read', 'mcp.user:read']],
  ])('aborts atomically for an %s scope set', async (_name, invalidPermissions) => {
    const user = await createTestUser()
    const validKey = await createApiKey(user.id, 'rss', 'Atomic migration valid row', ['rss:read'])
    const invalidKey = await createApiKey(user.id, 'mcp', 'Atomic migration invalid row', [
      'mcp.user:read',
    ])
    const result = await attemptInvalidTestApiKeyScopeMigration({
      validApiKeyId: validKey.apiKey.id,
      invalidApiKeyId: invalidKey.apiKey.id,
      invalidPermissions,
    })

    expect(result.errorMessage).toContain(
      'api_keys contains unknown, duplicate, mixed-audience, or invalid scope sets',
    )
    expect(result.validPermissionsAfterRollback).toEqual(['rss:read'])
  })
})
