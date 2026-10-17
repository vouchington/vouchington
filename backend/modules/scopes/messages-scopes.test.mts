import { describe, expect, it } from 'vitest'
import { listScopeCatalog } from './catalog.mts'
import { hasScope, validateScopeSet } from './scopes.mts'

describe('messages scopes', () => {
  it('requires exact read and write grants, with write depending on read', () => {
    const catalog = listScopeCatalog()

    expect(catalog.find(entry => entry.scope === 'messages:read')).toMatchObject({
      description_key: 'messages_read',
      requires: null,
      surfaces: ['api-key', 'oauth'],
    })
    expect(catalog.find(entry => entry.scope === 'messages:write')).toMatchObject({
      description_key: 'messages_write',
      requires: 'messages:read',
      surfaces: ['api-key', 'oauth'],
    })
    expect(hasScope(['mcp.user:read'], 'messages:read')).toBe(false)
    expect(hasScope(['mcp.user:write'], 'messages:write')).toBe(false)
    expect(hasScope(['messages:read'], 'messages:write')).toBe(false)
    expect(hasScope(['messages:read', 'mcp.user:write'], 'messages:write')).toBe(false)
    for (const surface of ['api-key', 'oauth'] as const) {
      expect(
        validateScopeSet(['messages:write'], { surface, allowMixedAudiences: false }),
      ).toMatchObject({
        valid: false,
        code: 'missing-prerequisite',
        requiredScope: 'messages:read',
      })
      expect(
        validateScopeSet(['messages:read', 'messages:write'], {
          surface,
          allowMixedAudiences: false,
        }).valid,
      ).toBe(true)
    }
  })
})
