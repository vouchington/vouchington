import { describe, expect, it } from 'vitest'
import { SCOPE_DEFINITIONS, hasScope, parseApiScope, validateScopeSet } from './scopes.mts'

describe('validateScopeSet', () => {
  it('parses only exact catalogue values', () => {
    expect(parseApiScope('rss:read')).toBe('rss:read')
    expect(parseApiScope('RSS:read')).toBeNull()
  })

  it('checks typed scope membership', () => {
    expect(hasScope(['mcp.user:read'], 'mcp.user:read')).toBe(true)
    expect(hasScope(['mcp.user:read'], 'mcp.user:write')).toBe(false)
  })

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
        surface: 'api-key',
        allowMixedAudiences: false,
      }),
    ).toMatchObject({ valid: false, code: 'mixed-audiences' })
  })

  it('allows OAuth grants to combine resource audiences', () => {
    expect(
      validateScopeSet(['rss:read', 'mcp.user:read'], {
        surface: 'oauth',
        allowMixedAudiences: true,
      }),
    ).toEqual({
      valid: true,
      scopes: ['mcp.user:read', 'rss:read'],
      audiences: ['api', 'user'],
    })
  })

  it('rejects a catalogue scope on an unsupported credential surface', () => {
    const definition = SCOPE_DEFINITIONS['rss:read']
    const originalSurfaces = definition.surfaces
    try {
      Reflect.set(definition, 'surfaces', ['oauth'])
      expect(
        validateScopeSet(['rss:read'], {
          surface: 'api-key',
          allowMixedAudiences: false,
        }),
      ).toEqual({ valid: false, code: 'unsupported-surface', scope: 'rss:read' })
    } finally {
      Reflect.set(definition, 'surfaces', originalSurfaces)
    }
  })

  it('declares every scope audience and supported credential surface', () => {
    expect(SCOPE_DEFINITIONS).toEqual({
      'mcp.admin:read': {
        action: 'read',
        audience: 'admin',
        resource: 'mcp.admin',
        surfaces: ['api-key', 'oauth'],
      },
      'mcp.admin:write': {
        action: 'write',
        audience: 'admin',
        requires: 'mcp.admin:read',
        resource: 'mcp.admin',
        surfaces: ['api-key', 'oauth'],
      },
      'mcp.user:read': {
        action: 'read',
        audience: 'user',
        resource: 'mcp.user',
        surfaces: ['api-key', 'oauth'],
      },
      'mcp.user:write': {
        action: 'write',
        audience: 'user',
        requires: 'mcp.user:read',
        resource: 'mcp.user',
        surfaces: ['api-key', 'oauth'],
      },
      'rss:read': {
        action: 'read',
        audience: 'api',
        resource: 'rss',
        surfaces: ['api-key', 'oauth'],
      },
    })
  })
})
