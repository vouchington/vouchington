import { describe, expect, it } from 'vitest'
import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/scopes'
import {
  oauthScopeAudiences,
  scopeResourceRows,
  toggleScope,
} from '../api-keys-manager/scope-selection'
import scopeCatalogFixture from '../../../../api-fixtures/v1/responses/shared.scopes.catalog.json'

const catalog = (scopeCatalogFixture as ScopeCatalogResponse).scopes

function entry(overrides: Partial<ScopeCatalogEntry> & Pick<ScopeCatalogEntry, 'scope'>) {
  const [resource, action] = overrides.scope.split(':') as [string, 'read' | 'write']
  return {
    resource,
    action,
    audience: 'user',
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
      write: null,
    })
  })

  it('keeps only the requested audiences', () => {
    const userRows = scopeResourceRows(catalog, 'api-key', ['user']).map(row => row.resource)
    expect(userRows).not.toContain('mcp.admin')
    expect(userRows).not.toContain('rss')

    const adminRows = scopeResourceRows(catalog, 'api-key', ['admin'])
    expect(adminRows[0]?.resource).toBe('mcp.admin')
    const adminEntries = adminRows.flatMap(row => [row.read, row.write]).filter(e => e != null)
    expect(adminEntries.map(e => e.audience)).toEqual(adminEntries.map(() => 'admin'))
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
    expect(oauthScopeAudiences(false)).toEqual(['user', 'api'])
    expect(oauthScopeAudiences(true)).toEqual(['user', 'api', 'admin'])
  })
})
