import { describe, expect, it } from 'vitest'
import { canAccessDynamicConfig, DYNAMIC_CONFIG_VIEWER_ROLES } from './dynamic-config-access'

describe('DYNAMIC_CONFIG_VIEWER_ROLES', () => {
  it('includes expected viewer roles', () => {
    expect(DYNAMIC_CONFIG_VIEWER_ROLES).toContain('moderator')
    expect(DYNAMIC_CONFIG_VIEWER_ROLES).toContain('developer')
    expect(DYNAMIC_CONFIG_VIEWER_ROLES).toContain('investor')
  })
})

describe('canAccessDynamicConfig', () => {
  it('returns true for administrator', () => {
    expect(canAccessDynamicConfig(['administrator'])).toBe(true)
  })

  it('returns true for each viewer role', () => {
    for (const role of DYNAMIC_CONFIG_VIEWER_ROLES) {
      expect(canAccessDynamicConfig([role])).toBe(true)
    }
  })

  it('returns false for empty roles', () => {
    expect(canAccessDynamicConfig([])).toBe(false)
  })

  it('returns false for non-viewer roles', () => {
    expect(canAccessDynamicConfig(['member'])).toBe(false)
  })
})
