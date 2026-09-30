import { describe, expect, it } from 'vitest'
import { validateApiKeyCreationPermissions } from './permissions.mts'
import { SCOPE_DEFINITIONS } from '@modules/scopes'

describe('validateApiKeyCreationPermissions', () => {
  it('allows rss read-only keys', () => {
    expect(validateApiKeyCreationPermissions('rss', ['rss:read'])).toBeNull()
  })

  it('rejects mcp write without matching read', () => {
    expect(validateApiKeyCreationPermissions('mcp', ['mcp.user:write'])).toBe(
      'mcp.user:write requires mcp.user:read',
    )
  })

  it('rejects duplicate permissions that do not exactly match a preset', () => {
    expect(validateApiKeyCreationPermissions('mcp', ['mcp.user:read', 'mcp.user:read'])).toBe(
      'api key scopes must not contain duplicates',
    )
  })

  it('rejects empty permission sets', () => {
    expect(validateApiKeyCreationPermissions('rss', [])).toBe('api key scopes must not be empty')
  })

  it('rejects catalogue scopes that do not support API keys', () => {
    const definition = SCOPE_DEFINITIONS['rss:read']
    const originalSurfaces = definition.surfaces
    try {
      Reflect.set(definition, 'surfaces', ['oauth'])
      expect(validateApiKeyCreationPermissions('rss', ['rss:read'])).toBe(
        'scope is not supported for API keys: rss:read',
      )
    } finally {
      Reflect.set(definition, 'surfaces', originalSurfaces)
    }
  })

  it.each([
    ['admin read', ['mcp.admin:read']],
    ['admin read and write', ['mcp.admin:write', 'mcp.admin:read']],
    ['mixed user and admin', ['mcp.user:read', 'mcp.admin:read']],
  ])('never mints an admin MCP API key: %s', (_name, scopes) => {
    expect(validateApiKeyCreationPermissions('mcp', scopes)).toMatch(
      /^scope is not supported for API keys: mcp\.admin:(read|write)$/,
    )
  })

  it('rejects scopes for the wrong API-key type', () => {
    expect(validateApiKeyCreationPermissions('rss', ['mcp.user:read'])).toBe(
      'rss keys must use rss:read',
    )
    expect(validateApiKeyCreationPermissions('mcp', ['rss:read'])).toBe(
      'mcp keys must use user-audience scopes',
    )
  })

  it('rejects unknown and noncanonical scopes', () => {
    expect(validateApiKeyCreationPermissions('rss', ['RSS:read'])).toBe(
      'unknown or noncanonical scope: RSS:read',
    )
  })
})
