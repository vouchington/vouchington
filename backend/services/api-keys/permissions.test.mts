import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '../users/types.mts'
import { validateApiKeyCreationPermissions } from './permissions.mts'

describe('validateApiKeyCreationPermissions', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })

  it('allows rss read-only keys', () => {
    expect(validateApiKeyCreationPermissions(user, 'rss', ['rss-feeds:read'])).toBeNull()
  })

  it('rejects mcp write without matching read', () => {
    expect(validateApiKeyCreationPermissions(user, 'mcp', ['mcp-tools:write'])).toBe(
      'mcp write permission requires mcp-tools:read',
    )
  })

  it('rejects mixed user and admin mcp scopes', () => {
    expect(
      validateApiKeyCreationPermissions(user, 'mcp', ['mcp-tools:read', 'mcp-admin-tools:read']),
    ).toBe('mcp keys must not mix user and admin permissions')
  })

  it('rejects duplicate permissions that do not exactly match a preset', () => {
    expect(
      validateApiKeyCreationPermissions(user, 'mcp', ['mcp-tools:read', 'mcp-tools:read']),
    ).toBe('mcp keys must use mcp-tools:read or mcp-tools:read, mcp-tools:write')
  })

  it('rejects non-admin users creating admin mcp scopes', () => {
    expect(validateApiKeyCreationPermissions(user, 'mcp', ['mcp-admin-tools:read'])).toBe(
      'admin mcp scopes require administrator role',
    )
  })

  it('rejects admin mcp write without matching read', () => {
    expect(validateApiKeyCreationPermissions(admin, 'mcp', ['mcp-admin-tools:write'])).toBe(
      'mcp admin write permission requires mcp-admin-tools:read',
    )
  })

  it('allows admins to create admin read-only and read-write mcp keys', () => {
    expect(validateApiKeyCreationPermissions(admin, 'mcp', ['mcp-admin-tools:read'])).toBeNull()
    expect(
      validateApiKeyCreationPermissions(admin, 'mcp', [
        'mcp-admin-tools:read',
        'mcp-admin-tools:write',
      ]),
    ).toBeNull()
  })
})
