import { describe, expect, it } from 'vitest'
import {
  SCOPE_DEFINITIONS,
  hasEveryScope,
  hasScope,
  parseApiScope,
  validateScopeSet,
  withScopePrerequisites,
} from './index.mts'

describe('validateScopeSet', () => {
  it('parses only exact catalogue values', () => {
    expect(parseApiScope('rss:read')).toBe('rss:read')
    expect(parseApiScope('RSS:read')).toBeNull()
  })

  it('checks typed scope membership', () => {
    expect(hasScope(['mcp.user:read'], 'mcp.user:read')).toBe(true)
    expect(hasScope(['mcp.user:read'], 'mcp.user:write')).toBe(false)
    expect(hasScope([], 'rss:read')).toBe(false)
  })

  it('lets legacy broad MCP grants satisfy resource-scoped requests', () => {
    expect(hasScope(['mcp.user:read'], 'topics:read')).toBe(true)
    expect(hasScope(['mcp.user:read'], 'cards:write')).toBe(false)
    expect(hasEveryScope(['cards:read', 'cards:write'], ['cards:write'])).toBe(true)
  })

  it('treats communities:read as a read-only resource scope under the user umbrella', () => {
    expect(hasScope(['mcp.user:read'], 'communities:read')).toBe(true)
    expect(hasScope(['communities:read'], 'communities:read')).toBe(true)
    expect(hasScope(['posts:read'], 'communities:read')).toBe(false)
    expect(hasScope(['mcp.admin:read'], 'communities:read')).toBe(false)
    expect(SCOPE_DEFINITIONS['communities:read']).toMatchObject({
      action: 'read',
      audience: 'user',
      resource: 'communities',
      surfaces: ['api-key', 'oauth'],
    })
    expect(SCOPE_DEFINITIONS['communities:read']).not.toHaveProperty('requires')
    expect(
      validateScopeSet(['communities:read'], { surface: 'oauth', allowMixedAudiences: false }),
    ).toMatchObject({ valid: true, scopes: ['communities:read'] })
  })

  it.each([
    ['hostnames:read', 'hostnames'],
    ['users:read', 'users'],
    ['reference-data:read', 'reference-data'],
    ['web-search:read', 'web-search'],
  ] as const)(
    'treats %s as a read-only resource scope under the user umbrella',
    (scope, resource) => {
      expect(hasScope(['mcp.user:read'], scope)).toBe(true)
      expect(hasScope([scope], scope)).toBe(true)
      expect(hasScope(['posts:read', 'lists:read'], scope)).toBe(false)
      expect(hasScope(['mcp.admin:read'], scope)).toBe(false)
      expect(SCOPE_DEFINITIONS[scope]).toMatchObject({
        action: 'read',
        audience: 'user',
        resource,
        surfaces: ['api-key', 'oauth'],
      })
      expect(SCOPE_DEFINITIONS[scope]).not.toHaveProperty('requires')
      expect(
        validateScopeSet([scope], { surface: 'oauth', allowMixedAudiences: false }),
      ).toMatchObject({
        valid: true,
        scopes: [scope],
      })
    },
  )

  it('returns scopes in canonical order with audience metadata', () => {
    expect(
      validateScopeSet(['mcp.user:write', 'mcp.user:read'], {
        surface: 'api-key',
        allowMixedAudiences: false,
      }),
    ).toEqual({
      valid: true,
      scopes: ['mcp.user:read', 'mcp.user:write'],
      audiences: ['user'],
    })
  })

  it.each([
    ['unknown scope', ['news:read']],
    ['uppercase scope', ['RSS:read']],
    ['whitespace-padded scope', [' rss:read']],
    ['duplicate scope', ['rss:read', 'rss:read']],
    ['write without read', ['mcp.user:write']],
  ])('rejects %s', (_name, scopes) => {
    expect(validateScopeSet(scopes, { surface: 'api-key', allowMixedAudiences: false }).valid).toBe(
      false,
    )
  })

  it('rejects mixed audiences when the credential surface forbids them', () => {
    expect(
      validateScopeSet(['mcp.user:read', 'mcp.admin:read'], {
        surface: 'oauth',
        allowMixedAudiences: false,
      }),
    ).toMatchObject({ valid: false, code: 'mixed-audiences' })
  })

  it('rejects administrator MCP scopes on API keys, which are OAuth-only', () => {
    expect(
      validateScopeSet(['mcp.admin:read'], { surface: 'api-key', allowMixedAudiences: false }),
    ).toEqual({ valid: false, code: 'unsupported-surface', scope: 'mcp.admin:read' })
  })

  it('allows OAuth grants to combine resource audiences', () => {
    expect(
      validateScopeSet(['mcp.user:read', 'mcp.admin:read'], {
        surface: 'oauth',
        allowMixedAudiences: true,
      }),
    ).toEqual({
      valid: true,
      scopes: ['mcp.admin:read', 'mcp.user:read'],
      audiences: ['admin', 'user'],
    })
  })

  it('rejects a catalogue scope on an unsupported credential surface', () => {
    expect(
      validateScopeSet(['rss:read'], {
        surface: 'oauth',
        allowMixedAudiences: true,
      }),
    ).toEqual({ valid: false, code: 'unsupported-surface', scope: 'rss:read' })
  })

  it('declares canonical resource scopes with audience and prerequisites', () => {
    expect(SCOPE_DEFINITIONS['topics:read']).toMatchObject({ audience: 'user', action: 'read' })
    expect(SCOPE_DEFINITIONS['cards:write']).toMatchObject({
      audience: 'user',
      action: 'write',
      requires: 'cards:read',
    })
  })

  it.each([['bookmarks'], ['lists'], ['notifications'], ['preferences'], ['profile']] as const)(
    'declares %s read and write resource scopes whose write is not satisfied by read',
    resource => {
      const read = `${resource}:read` as const
      const write = `${resource}:write` as const

      expect(SCOPE_DEFINITIONS[read]).toMatchObject({
        action: 'read',
        audience: 'user',
        resource,
        surfaces: ['api-key', 'oauth'],
      })
      expect(SCOPE_DEFINITIONS[write]).toMatchObject({
        action: 'write',
        audience: 'user',
        requires: read,
        resource,
        surfaces: ['api-key', 'oauth'],
      })
      expect(hasScope([read], write)).toBe(false)
      expect(hasEveryScope([read], [read, write])).toBe(false)
      expect(hasScope(['mcp.user:read'], write)).toBe(false)
      expect(hasScope(['mcp.user:read', 'mcp.user:write'], write)).toBe(true)
      expect(hasScope(['mcp.user:read'], read)).toBe(true)
      expect(hasScope(['mcp.admin:read', 'mcp.admin:write'], write)).toBe(false)
      expect(validateScopeSet([write], { surface: 'oauth', allowMixedAudiences: false })).toEqual({
        valid: false,
        code: 'missing-prerequisite',
        scope: write,
        requiredScope: read,
      })
      expect(withScopePrerequisites([write])).toEqual([read, write])
    },
  )

  it('requires the complete entity-relation private-delegation chain', () => {
    const privateWrite = 'post-relations.owned-private:write'
    expect(
      validateScopeSet(['entity-relations:read', 'entity-relations:write', privateWrite], {
        surface: 'api-key',
        allowMixedAudiences: false,
      }),
    ).toEqual({
      valid: true,
      scopes: ['entity-relations:read', 'entity-relations:write', privateWrite],
      audiences: ['user'],
    })
    expect(withScopePrerequisites([privateWrite])).toEqual([
      'entity-relations:read',
      'entity-relations:write',
      privateWrite,
    ])
  })

  it('does not let broad MCP write imply the exact private-delegation capability', () => {
    expect(
      hasScope(['mcp.user:read', 'mcp.user:write'], 'post-relations.owned-private:write'),
    ).toBe(false)
  })

  it.each([
    'financial-profile:read',
    'financial-profile:write',
    'spending:read',
    'spending:write',
  ] as const)('requires an exact grant for %s', scope => {
    expect(hasScope(['mcp.user:read', 'mcp.user:write'], scope)).toBe(false)
    expect(hasScope([scope], scope)).toBe(true)
  })

  it('reads a replaced credential surface from the live catalogue', () => {
    const definition = SCOPE_DEFINITIONS['rss:read']
    const originalSurfaces = definition.surfaces
    try {
      Reflect.set(definition, 'surfaces', ['oauth'])
      expect(
        validateScopeSet(['rss:read'], { surface: 'api-key', allowMixedAudiences: false }),
      ).toEqual({ valid: false, code: 'unsupported-surface', scope: 'rss:read' })
    } finally {
      Reflect.set(definition, 'surfaces', originalSurfaces)
    }
  })
})
