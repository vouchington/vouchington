import { describe, it, expect } from 'vitest'
import { isToolAllowedForUser } from './authorization.mts'
import type { Tool } from '@voucha/tools/types'

function makeMinimalTool(roles?: Record<string, boolean>): Tool {
  return {
    schema: { name: 'test_tool', type: 'function', parameters: null, strict: null },
    function: () => () => Promise.resolve({}),
    roles,
  } as unknown as Tool
}

describe('isToolAllowedForUser', () => {
  it('allows any user when tool has no roles restriction', () => {
    const tool = makeMinimalTool(undefined)
    const user = { id: 'user-1', roles: [] as const }
    expect(isToolAllowedForUser(tool, user)).toBe(true)
  })

  it('denies user with no matching roles', () => {
    const tool = makeMinimalTool({ staff: true })
    const user = { id: 'user-1', roles: [] as const }
    expect(isToolAllowedForUser(tool, user)).toBe(false)
  })

  it('allows user whose role matches', () => {
    const tool = makeMinimalTool({ staff: true })
    const user = { id: 'user-1', roles: ['staff'] as const }
    expect(isToolAllowedForUser(tool, user)).toBe(true)
  })

  it('allows when tool roles has user: true and user has role "user"', () => {
    const tool = makeMinimalTool({ user: true })
    const user = { id: 'user-1', roles: ['user'] as const }
    expect(isToolAllowedForUser(tool, user)).toBe(true)
  })

  it('falls through to user role check when no role matches directly', () => {
    // Tool restricts to staff only — but also has user: true
    const tool = makeMinimalTool({ staff: true, user: true })
    const user = { id: 'user-1', roles: [] as const }
    // No role matches, but tool.roles.user === true
    expect(isToolAllowedForUser(tool, user)).toBe(true)
  })

  it('returns false when no role matches and tool.roles.user is not true', () => {
    const tool = makeMinimalTool({ staff: true, user: false })
    const user = { id: 'user-1', roles: [] as const }
    expect(isToolAllowedForUser(tool, user)).toBe(false)
  })

  it('allows administrator role when it matches', () => {
    const tool = makeMinimalTool({ administrator: true })
    const user = { id: 'user-1', roles: ['administrator'] as const }
    expect(isToolAllowedForUser(tool, user)).toBe(true)
  })
})
