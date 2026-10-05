import { describe, expect, it } from 'vitest'
import { hasScope, validateScopeSet, type ApiScope } from './index.mts'

const exact: ApiScope[] = [
  'moderation:approve',
  'moderation:ai-rerun',
  'moderation:agent-votes',
  'account-enforcement:suspend',
  'account-enforcement:penalize',
  'account-enforcement:vote-weight',
  'site-operations:queues',
  'site-operations:config',
  'site-operations:jobs',
  'copyright-notices:read',
  'copyright-notices:write',
  'analytics:read',
  'editorial:read',
  'editorial:write',
]
const ordinary: ApiScope[] = [
  'moderation:read',
  'moderation:write',
  'account-enforcement:read',
  'account-enforcement:write',
  'site-operations:read',
]
const broad: ApiScope[] = ['mcp.admin:read', 'mcp.admin:write', ...ordinary]

describe('admin resource permissions', () => {
  it.each(exact)('%s requires its own OAuth grant', scope => {
    expect(hasScope(broad, scope)).toBe(false)
    expect(hasScope([...broad, scope], scope)).toBe(true)
    expect(
      validateScopeSet([scope], { surface: 'api-key', allowMixedAudiences: false }).valid,
    ).toBe(false)
  })
  it.each(ordinary)('%s remains covered by its admin umbrella, exclusively on OAuth', scope => {
    expect(hasScope(['mcp.admin:read', 'mcp.admin:write'], scope)).toBe(true)
    expect(
      validateScopeSet([scope], { surface: 'api-key', allowMixedAudiences: false }).valid,
    ).toBe(false)
  })
  it('does not imply a sensitive sibling from another sensitive grant', () => {
    expect(hasScope(['moderation:approve'], 'moderation:ai-rerun')).toBe(false)
    expect(hasScope(['account-enforcement:suspend'], 'account-enforcement:penalize')).toBe(false)
  })
})
