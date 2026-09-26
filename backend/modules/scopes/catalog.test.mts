import { describe, expect, it } from 'vitest'
import { listScopeCatalog } from './catalog.mts'
import { SCOPE_DEFINITIONS, validateScopeSet } from './scopes.mts'

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
      requires: 'cards:read',
      surfaces: ['api-key', 'oauth'],
    })
    const rss = catalog.find(entry => entry.scope === 'rss:read')
    expect(rss).toMatchObject({ audience: 'api', requires: null })
    rss?.surfaces.push('oauth')
    expect(SCOPE_DEFINITIONS['rss:read'].surfaces).toEqual(['api-key'])
  })

  it('pairs every write scope with a read prerequisite that validates', () => {
    for (const entry of listScopeCatalog().filter(item => item.action === 'write')) {
      expect(entry.requires).not.toBeNull()
      expect(
        validateScopeSet([entry.requires!, entry.scope], {
          surface: 'api-key',
          allowMixedAudiences: false,
        }).valid,
      ).toBe(true)
    }
  })
})
