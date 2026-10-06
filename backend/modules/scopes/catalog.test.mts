import { describe, expect, it } from 'vitest'
import { listScopeCatalog } from './catalog.mts'
import { SCOPE_DEFINITIONS, validateScopeSet, type ApiScope } from './scopes.mts'
import { withScopePrerequisites } from './authorization.mts'

describe('listScopeCatalog', () => {
  it('lists every canonical scope once, in sorted order', () => {
    const scopes = listScopeCatalog().map(entry => entry.scope)
    expect(scopes).toEqual(Object.keys(SCOPE_DEFINITIONS).toSorted())
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

  it('projects stable descriptions for umbrella and sensitive financial scopes', () => {
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
    expect(catalog.find(entry => entry.scope === 'financial-profile:read')?.description_key).toBe(
      'financial_profile_read',
    )
    expect(catalog.find(entry => entry.scope === 'financial-profile:write')?.description_key).toBe(
      'financial_profile_write',
    )
    expect(catalog.find(entry => entry.scope === 'spending:read')?.description_key).toBe(
      'spending_read',
    )
    expect(catalog.find(entry => entry.scope === 'spending:write')?.description_key).toBe(
      'spending_write',
    )
    expect(catalog.find(entry => entry.scope === 'cards:read')?.description_key).toBeNull()
  })

  it('pairs every write scope with a read prerequisite, bar the one declared write-only scope', () => {
    const writes = listScopeCatalog().filter(item => item.action === 'write')
    // `reports:write` is deliberately write-only: filing a report has no member-readable
    // counterpart (`GET /reports` is staff-only), so a read prerequisite would grant nothing.
    expect(writes.filter(entry => entry.requires === null).map(entry => entry.scope)).toEqual([
      'reports:write',
    ])
    for (const entry of writes) {
      for (const surface of entry.surfaces) {
        expect(
          validateScopeSet(withScopePrerequisites([entry.scope as ApiScope]), {
            surface,
            allowMixedAudiences: false,
          }).valid,
        ).toBe(true)
      }
    }
  })

  it('keeps administrator MCP scopes off API keys', () => {
    const catalog = listScopeCatalog()
    for (const scope of ['mcp.admin:read', 'mcp.admin:write']) {
      expect(catalog.find(entry => entry.scope === scope)?.surfaces).toEqual(['oauth'])
    }
  })
})
