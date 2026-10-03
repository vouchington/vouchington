import { describe, expect, it } from 'vitest'
import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/scopes'
import {
  oauthScopeAudiences,
  scopeResourceRows,
  toggleScope,
} from '../api-keys-manager/scope-selection'
import { scopeDescriptionMessageKey } from '../api-keys-manager/scope-description'
import scopeCatalogFixture from '../../../../api-fixtures/v1/responses/shared.scopes.catalog.json'

const catalog = (scopeCatalogFixture as ScopeCatalogResponse).scopes

function entry(overrides: Partial<ScopeCatalogEntry> & Pick<ScopeCatalogEntry, 'scope'>) {
  const [resource, action] = overrides.scope.split(':') as [string, 'read' | 'write']
  return {
    resource,
    action,
    audience: 'user',
    description_key: null,
    requires: null,
    surfaces: ['api-key', 'oauth'],
    ...overrides,
  } satisfies ScopeCatalogEntry
}

describe('scopeResourceRows', () => {
  it('pairs read and write scopes per resource with the MCP umbrella first', () => {
    const rows = scopeResourceRows(catalog, 'api-key', ['user'])

    expect(rows[0]).toMatchObject({
      resource: 'mcp.user',
      umbrella: true,
      read: expect.objectContaining({ scope: 'mcp.user:read' }),
      write: expect.objectContaining({ scope: 'mcp.user:write' }),
    })
    const rest = rows.slice(1).map(row => row.resource)
    expect(rest).toEqual(rest.toSorted((a, b) => a.localeCompare(b)))
    expect(rows.find(row => row.resource === 'posts')).toMatchObject({
      umbrella: false,
      write: expect.objectContaining({ scope: 'posts:write', requires: 'posts:read' }),
    })
  })

  it('keeps only the requested audiences', () => {
    const userRows = scopeResourceRows(catalog, 'api-key', ['user']).map(row => row.resource)
    expect(userRows).not.toContain('mcp.admin')
    expect(userRows).not.toContain('rss')

    const adminRows = scopeResourceRows(catalog, 'oauth', ['admin'])
    expect(adminRows[0]?.resource).toBe('mcp.admin')
    const adminEntries = adminRows.flatMap(row => [row.read, row.write]).filter(e => e != null)
    expect(adminEntries.map(e => e.audience)).toEqual(adminEntries.map(() => 'admin'))
  })

  it('retains every exact administrator capability independently', () => {
    const expected = catalog.filter(
      entry => entry.audience === 'admin' && entry.surfaces.includes('oauth'),
    )
    const actual = scopeResourceRows(catalog, 'oauth', ['admin'])
      .flatMap(row => [row.read, row.write])
      .filter(entry => entry != null)
    expect(actual.map(entry => entry.scope).toSorted()).toEqual(
      expected.map(entry => entry.scope).toSorted(),
    )
    expect(toggleScope(catalog, [], 'moderation:approve', true).toSorted()).toEqual([
      'moderation:approve',
      'moderation:read',
    ])
  })

  it('never offers administrator scopes on API keys, which are OAuth-only for admin MCP', () => {
    expect(scopeResourceRows(catalog, 'api-key', ['user', 'admin'])).not.toContainEqual(
      expect.objectContaining({ resource: 'mcp.admin' }),
    )
  })

  it('keeps only scopes offered on the credential surface', () => {
    const rows = scopeResourceRows(
      [entry({ scope: 'posts:read', surfaces: ['oauth'] }), entry({ scope: 'cards:read' })],
      'api-key',
      ['user'],
    )

    expect(rows.map(row => row.resource)).toEqual(['cards'])
  })
})

describe('toggleScope', () => {
  it('checking a scope also selects the scopes it requires', () => {
    expect(toggleScope(catalog, [], 'cards:write', true)).toEqual(['cards:read', 'cards:write'])
  })

  it('follows prerequisite chains and returns scopes in catalogue order', () => {
    const chain = [
      entry({ scope: 'a:read' }),
      entry({ scope: 'b:read', requires: 'a:read' }),
      entry({ scope: 'c:read', requires: 'b:read' }),
    ]

    expect(toggleScope(chain, [], 'c:read', true)).toEqual(['a:read', 'b:read', 'c:read'])
    expect(toggleScope(chain, ['a:read', 'b:read', 'c:read'], 'a:read', false)).toEqual([])
  })

  it('selects and removes the complete own-private relation-write prerequisite chain', () => {
    const privateWrite = 'post-relations.owned-private:write'
    const selected = toggleScope(catalog, [], privateWrite, true)

    expect(selected).toEqual(['entity-relations:read', 'entity-relations:write', privateWrite])
    expect(toggleScope(catalog, selected, 'entity-relations:read', false)).toEqual([])
    expect(toggleScope(catalog, selected, 'entity-relations:write', false)).toEqual([
      'entity-relations:read',
    ])
  })

  it('unchecking a prerequisite drops the scopes that require it', () => {
    expect(
      toggleScope(catalog, ['cards:read', 'cards:write', 'posts:read'], 'cards:read', false),
    ).toEqual(['posts:read'])
  })

  it('unchecking a dependent scope keeps its prerequisite', () => {
    expect(toggleScope(catalog, ['cards:read', 'cards:write'], 'cards:write', false)).toEqual([
      'cards:read',
    ])
  })
})

describe('oauthScopeAudiences', () => {
  it('offers admin scopes only to administrators', () => {
    expect(oauthScopeAudiences(false)).toEqual(['user'])
    expect(oauthScopeAudiences(true)).toEqual(['user', 'admin'])
  })
})

describe('scopeDescriptionMessageKey', () => {
  it('maps every stable catalogue description key to web-localized copy', () => {
    expect(scopeDescriptionMessageKey('mcp_user_full_access')).toBe(
      'settings.apiKeys.scopeDescription.mcpUserFullAccess',
    )
    expect(scopeDescriptionMessageKey('mcp_admin_full_access')).toBe(
      'settings.apiKeys.scopeDescription.mcpAdminFullAccess',
    )
  })

  it('fails closed when an unrecognized description key reaches the client', () => {
    expect(() => scopeDescriptionMessageKey('unrecognized' as never)).toThrow(
      'Unknown scope description key',
    )
  })
})
