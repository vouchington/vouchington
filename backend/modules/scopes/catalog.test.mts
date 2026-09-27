import { describe, expect, it } from 'vitest'
import { listScopeCatalog } from './catalog.mts'
import { SCOPE_DEFINITIONS, validateScopeSet, type ApiScope } from './scopes.mts'
import { withScopePrerequisites } from './authorization.mts'

describe('listScopeCatalog', () => {
  it('lists every canonical scope once, in sorted order', () => {
    const scopes = listScopeCatalog().map(entry => entry.scope)
    expect(scopes).toEqual(Object.keys(SCOPE_DEFINITIONS).sort())
  })

  it('projects prerequisites and surfaces without sharing the definition arrays', () => {
    const catalog = listScopeCatalog()
    expect(catalog.find(entry => entry.scope === 'cards:write')).toEqual({
      scope: 'cards:write',
      resource: 'cards',
      action: 'write',
      audience: 'user',
      description_key: null,
      requires: 'cards:read',
      surfaces: ['api-key', 'oauth'],
    })
    const rss = catalog.find(entry => entry.scope === 'rss:read')
    expect(rss).toMatchObject({ audience: 'api', requires: null })
    rss?.surfaces.push('oauth')
    expect(SCOPE_DEFINITIONS['rss:read'].surfaces).toEqual(['api-key'])
  })

  it('projects stable descriptions only for MCP umbrella scopes', () => {
    const catalog = listScopeCatalog()

    expect(catalog.find(entry => entry.scope === 'mcp.user:read')?.description_key).toBe(
      'mcp_user_full_access',
    )
    expect(catalog.find(entry => entry.scope === 'mcp.user:write')?.description_key).toBe(
      'mcp_user_full_access',
    )
    expect(catalog.find(entry => entry.scope === 'mcp.admin:read')?.description_key).toBe(
      'mcp_admin_full_access',
    )
    expect(catalog.find(entry => entry.scope === 'mcp.admin:write')?.description_key).toBe(
      'mcp_admin_full_access',
    )
    expect(catalog.find(entry => entry.scope === 'cards:read')?.description_key).toBeNull()
  })

  it('pairs every write scope with a read prerequisite that validates', () => {
    for (const entry of listScopeCatalog().filter(item => item.action === 'write')) {
      expect(entry.requires).not.toBeNull()
      expect(
        validateScopeSet(withScopePrerequisites([entry.scope as ApiScope]), {
          surface: 'api-key',
          allowMixedAudiences: false,
        }).valid,
      ).toBe(true)
    }
  })
})
