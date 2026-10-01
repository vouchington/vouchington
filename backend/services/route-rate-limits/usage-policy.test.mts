import { describe, expect, it } from 'vitest'
import {
  resolveUsagePlan,
  resolveUsageScopeClass,
  selectUsageQuota,
  USAGE_QUOTA_WINDOW_SECONDS,
} from './usage-policy.mts'
import type { UsagePlan, UsageScopeClass, UsageSurface } from './usage-types.mts'

function limitFor(surface: UsageSurface, plan: UsagePlan, scopeClass: UsageScopeClass): number {
  return selectUsageQuota({ surface, plan, scopeClass }).limit
}

describe('selectUsageQuota', () => {
  it('gives a write-capable credential a smaller allowance than a read-only one', () => {
    for (const surface of ['mcp_user', 'mcp_admin'] as const) {
      expect(limitFor(surface, 'free', 'write')).toBeLessThan(limitFor(surface, 'free', 'read'))
    }
  })

  it('raises the allowance with the membership plan', () => {
    for (const scopeClass of ['read', 'write'] as const) {
      expect(limitFor('mcp_user', 'plus', scopeClass)).toBeGreaterThan(
        limitFor('mcp_user', 'free', scopeClass),
      )
      expect(limitFor('mcp_user', 'pro', scopeClass)).toBeGreaterThan(
        limitFor('mcp_user', 'plus', scopeClass),
      )
    }
  })

  it('gives the staff-only admin surface a larger allowance than the user surface', () => {
    expect(limitFor('mcp_admin', 'free', 'write')).toBeGreaterThan(
      limitFor('mcp_user', 'free', 'write'),
    )
  })

  it('counts every selection over the one sliding window', () => {
    expect(selectUsageQuota({ surface: 'mcp_user', plan: 'pro', scopeClass: 'read' })).toEqual(
      expect.objectContaining({ windowSeconds: USAGE_QUOTA_WINDOW_SECONDS }),
    )
  })
})

describe('resolveUsagePlan', () => {
  it('maps a paid membership to its plan and everyone else to free', () => {
    expect(resolveUsagePlan({ membership_plan: 'plus' })).toBe('plus')
    expect(resolveUsagePlan({ membership_plan: 'pro' })).toBe('pro')
    expect(resolveUsagePlan({ membership_plan: null })).toBe('free')
    expect(resolveUsagePlan({})).toBe('free')
  })
})

describe('resolveUsageScopeClass', () => {
  it('is read-class when no granted scope can change state', () => {
    expect(resolveUsageScopeClass(['mcp.user:read'])).toBe('read')
    expect(resolveUsageScopeClass(['mcp.user:read', 'rss:read'])).toBe('read')
  })

  it('is write-class when any granted scope can change state', () => {
    expect(resolveUsageScopeClass(['mcp.user:read', 'mcp.user:write'])).toBe('write')
    expect(resolveUsageScopeClass(['rss:read', 'mcp.user:write'])).toBe('write')
  })
})
