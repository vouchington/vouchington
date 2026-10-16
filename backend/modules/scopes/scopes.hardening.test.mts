import { describe, expect, it } from 'vitest'
import { SCOPE_DEFINITIONS, hasScope, validateScopeSet, withScopePrerequisites } from './index.mts'

describe('community moderation exact grants', () => {
  it('requires exact community moderation grants on both credential surfaces', () => {
    const read = 'community-moderation:read'
    const write = 'community-moderation:write'

    expect(SCOPE_DEFINITIONS[read]).toMatchObject({
      action: 'read',
      audience: 'user',
      descriptionKey: 'community_moderation_read',
      requiresExactGrant: true,
      resource: 'community-moderation',
      surfaces: ['api-key', 'oauth'],
    })
    expect(SCOPE_DEFINITIONS[read]).not.toHaveProperty('requires')
    expect(SCOPE_DEFINITIONS[write]).toMatchObject({
      action: 'write',
      audience: 'user',
      descriptionKey: 'community_moderation_write',
      requires: read,
      requiresExactGrant: true,
      resource: 'community-moderation',
      surfaces: ['api-key', 'oauth'],
    })
    expect(hasScope([read], read)).toBe(true)
    expect(hasScope(['mcp.user:read'], read)).toBe(false)
    expect(hasScope(['mcp.user:read', 'mcp.user:write'], read)).toBe(false)
    expect(hasScope(['mcp.user:read', 'mcp.user:write'], write)).toBe(false)
    expect(hasScope([read, write], write)).toBe(true)
    expect(withScopePrerequisites([write])).toEqual([read, write])

    for (const surface of ['api-key', 'oauth'] as const) {
      expect(validateScopeSet([read], { surface, allowMixedAudiences: false })).toMatchObject({
        valid: true,
        scopes: [read],
      })
      expect(validateScopeSet([write], { surface, allowMixedAudiences: false })).toMatchObject({
        valid: false,
        code: 'missing-prerequisite',
        requiredScope: read,
      })
      expect(
        validateScopeSet([read, write], { surface, allowMixedAudiences: false }),
      ).toMatchObject({ valid: true, scopes: [read, write] })
    }
  })
})
