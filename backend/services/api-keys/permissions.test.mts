import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '../users/types.mts'
import { validateApiKeyCreationPermissions } from './permissions.mts'
import { SCOPE_DEFINITIONS } from '@modules/scopes'

describe('validateApiKeyCreationPermissions', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })

  it('allows rss read-only keys', () => {
    expect(validateApiKeyCreationPermissions(user, 'rss', ['rss:read'])).toBeNull()
  })

  it('rejects mcp write without matching read', () => {
    expect(validateApiKeyCreationPermissions(user, 'mcp', ['mcp.user:write'])).toBe(
      'mcp.user:write requires mcp.user:read',
    )
  })

  it('rejects mixed user and admin mcp scopes', () => {
    expect(
      validateApiKeyCreationPermissions(user, 'mcp', ['mcp.user:read', 'mcp.admin:read']),
    ).toBe('api key scopes must not mix audiences')
  })

  it('rejects duplicate permissions that do not exactly match a preset', () => {
    expect(validateApiKeyCreationPermissions(user, 'mcp', ['mcp.user:read', 'mcp.user:read'])).toBe(
      'api key scopes must not contain duplicates',
    )
  })

  it('rejects empty permission sets', () => {
    expect(validateApiKeyCreationPermissions(user, 'rss', [])).toBe(
      'api key scopes must not be empty',
    )
  })

  it('rejects catalogue scopes that do not support API keys', () => {
    const definition = SCOPE_DEFINITIONS['rss:read']
    const originalSurfaces = definition.surfaces
    try {
      Reflect.set(definition, 'surfaces', ['oauth'])
      expect(validateApiKeyCreationPermissions(user, 'rss', ['rss:read'])).toBe(
        'scope is not supported for API keys: rss:read',
      )
    } finally {
      Reflect.set(definition, 'surfaces', originalSurfaces)
    }
  })

  it('rejects non-admin users creating admin mcp scopes', () => {
    expect(validateApiKeyCreationPermissions(user, 'mcp', ['mcp.admin:read'])).toBe(
      'admin mcp scopes require administrator role',
    )
  })

  it('rejects admin mcp write without matching read', () => {
    expect(validateApiKeyCreationPermissions(admin, 'mcp', ['mcp.admin:write'])).toBe(
      'mcp.admin:write requires mcp.admin:read',
    )
  })

  it('allows admins to create admin read-only and read-write mcp keys', () => {
    expect(validateApiKeyCreationPermissions(admin, 'mcp', ['mcp.admin:read'])).toBeNull()
    expect(
      validateApiKeyCreationPermissions(admin, 'mcp', ['mcp.admin:write', 'mcp.admin:read']),
    ).toBeNull()
  })

  it('rejects scopes for the wrong API-key type', () => {
    expect(validateApiKeyCreationPermissions(user, 'rss', ['mcp.user:read'])).toBe(
      'rss keys must use rss:read',
    )
    expect(validateApiKeyCreationPermissions(user, 'mcp', ['rss:read'])).toBe(
      'mcp keys must use only mcp.user or mcp.admin scopes',
    )
  })

  it('rejects unknown and noncanonical scopes', () => {
    expect(validateApiKeyCreationPermissions(user, 'rss', ['RSS:read'])).toBe(
      'unknown or noncanonical scope: RSS:read',
    )
  })
})
