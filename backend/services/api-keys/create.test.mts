import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from './create.mts'

describe('createApiKey', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
  })

  it('canonicalizes permission order before persistence', async () => {
    const admin = await createTestUser({ administrator: true })
    const { apiKey } = await createApiKey(admin.id, 'mcp', 'Canonical scopes', [
      'mcp.admin:write',
      'mcp.admin:read',
    ])

    expect(apiKey.permissions).toEqual(['mcp.admin:read', 'mcp.admin:write'])
  })

  it('rejects admin scopes for a non-admin direct service caller', async () => {
    const user = await createTestUser()

    await expect(
      createApiKey(user.id, 'mcp', 'Invalid admin scope', ['mcp.admin:read']),
    ).rejects.toThrow('admin mcp scopes require administrator role')
  })

  it('rejects the wrong scope namespace for a key type', async () => {
    const user = await createTestUser()

    await expect(
      createApiKey(user.id, 'rss', 'Invalid namespace', ['mcp.user:read']),
    ).rejects.toThrow('rss keys must use rss:read')
  })
})
