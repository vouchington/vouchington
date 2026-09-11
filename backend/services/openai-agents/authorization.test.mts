import { it, expect, describe } from 'vitest'
import { assertToolAllowedForUser } from './authorization.mts'

describe('authorization', () => {
  const schema = { name: 'test_tool' }

  it('allows tool with no roles constraint for any user', () => {
    const user = { id: 'u1', roles: [] as readonly string[] }
    expect(() => assertToolAllowedForUser({ schema }, user)).not.toThrow()
  })

  it('allows administrator-only tool for admin user', () => {
    const user = { id: 'u1', roles: ['administrator'] as readonly string[] }
    expect(() =>
      assertToolAllowedForUser({ schema, roles: { administrator: true } }, user),
    ).not.toThrow()
  })

  it('throws for non-admin when tool requires administrator role', () => {
    const user = { id: 'u1', roles: [] as readonly string[] }
    expect(() =>
      assertToolAllowedForUser({ schema, roles: { administrator: true, user: false } }, user),
    ).toThrow(/test_tool/)
  })

  it('throws for admin when role is not explicitly true', () => {
    const user = { id: 'u1', roles: ['administrator'] as readonly string[] }
    expect(() =>
      assertToolAllowedForUser({ schema, roles: { administrator: false } }, user),
    ).toThrow(/test_tool/)
  })

  it('allows user-role tool for non-admin user', () => {
    const user = { id: 'u1', roles: [] as readonly string[] }
    expect(() => assertToolAllowedForUser({ schema, roles: { user: true } }, user)).not.toThrow()
  })

  it('allows user-role tool for admin user (admin is superset of user)', () => {
    const user = { id: 'u1', roles: ['administrator'] as readonly string[] }
    expect(() => assertToolAllowedForUser({ schema, roles: { user: true } }, user)).not.toThrow()
  })

  it('allows explicitly configured custom roles', () => {
    const user = { id: 'u1', roles: ['customer_support'] as readonly string[] }
    expect(() =>
      assertToolAllowedForUser({ schema, roles: { customer_support: true } }, user),
    ).not.toThrow()
  })

  it('throws when the user has a custom role that is not explicitly allowed', () => {
    const user = { id: 'u1', roles: ['customer_support'] as readonly string[] }
    expect(() =>
      assertToolAllowedForUser({ schema, roles: { administrator: true, user: false } }, user),
    ).toThrow(/role customer_support/)
  })
})
