import { describe, expect, it } from 'vitest'
import {
  SCOPE_DEFINITIONS,
  hasEveryScope,
  hasScope,
  parseApiScope,
  validateScopeSet,
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

  it('declares canonical resource scopes with audience and prerequisites', () => {
    expect(SCOPE_DEFINITIONS['topics:read']).toMatchObject({ audience: 'user', action: 'read' })
    expect(SCOPE_DEFINITIONS['cards:write']).toMatchObject({
      audience: 'user',
      action: 'write',
      requires: 'cards:read',
    })
    expect(SCOPE_DEFINITIONS['support-messages:read']).toMatchObject({
      audience: 'admin',
      action: 'read',
    })
  })
})
