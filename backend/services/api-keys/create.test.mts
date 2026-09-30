import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from './create.mts'

describe('createApiKey', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'this is a fake test API key checksum secret'
  })

  it('canonicalizes permission order before persistence', async () => {
    const user = await createTestUser()
    const { apiKey } = await createApiKey(user.id, 'mcp', 'Canonical scopes', [
      'mcp.user:write',
      'mcp.user:read',
    ])

    expect(apiKey.permissions).toEqual(['mcp.user:read', 'mcp.user:write'])
  })

  it.each([
    ['administrator', true],
    ['non-administrator', false],
  ])('never creates an admin MCP key for a %s', async (_name, administrator) => {
    const user = await createTestUser({ administrator })

    await expect(
      createApiKey(user.id, 'mcp', 'Invalid admin scope', ['mcp.admin:read']),
    ).rejects.toThrow('scope is not supported for API keys: mcp.admin:read')
  })

  it('rejects the wrong scope namespace for a key type', async () => {
    const user = await createTestUser()

    await expect(
      createApiKey(user.id, 'rss', 'Invalid namespace', ['mcp.user:read']),
    ).rejects.toThrow('rss keys must use rss:read')
  })
})
