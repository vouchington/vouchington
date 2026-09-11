import { describe, expect, it } from 'vitest'
import {
  DYNAMIC_CONFIG_VIEWER_ROLES,
  currentUserCanAccessDynamicConfigNamespace,
} from './authorization.mts'
import { getDynamicConfigRegistryEntry } from './registry.mts'
import type { DynamicConfigRegistryEntry, DynamicConfigUser } from './types.mts'

const moderatorEntry: Pick<DynamicConfigRegistryEntry, 'access'> = {
  access: { update_roles: ['moderator'] },
}

const developerEntry: Pick<DynamicConfigRegistryEntry, 'access'> = {
  access: { update_roles: ['developer'] },
}

const sharedEntry: Pick<DynamicConfigRegistryEntry, 'access'> = {
  access: { update_roles: ['moderator', 'developer'] },
}

const noRolesEntry: Pick<DynamicConfigRegistryEntry, 'access'> = {
  access: { update_roles: [] },
}

function makeUser(roles: string[]): DynamicConfigUser {
  return { id: 'user_test', roles }
}

describe('DYNAMIC_CONFIG_VIEWER_ROLES', () => {
  it('includes moderator, developer, customer_support, and investor', () => {
    expect(DYNAMIC_CONFIG_VIEWER_ROLES).toContain('moderator')
    expect(DYNAMIC_CONFIG_VIEWER_ROLES).toContain('developer')
    expect(DYNAMIC_CONFIG_VIEWER_ROLES).toContain('customer_support')
    expect(DYNAMIC_CONFIG_VIEWER_ROLES).toContain('investor')
  })
})

describe('currentUserCanAccessDynamicConfigNamespace', () => {
  it('returns false for null user', () => {
    expect(currentUserCanAccessDynamicConfigNamespace(null, moderatorEntry, 'view')).toBe(false)
    expect(currentUserCanAccessDynamicConfigNamespace(null, moderatorEntry, 'update')).toBe(false)
  })

  it('allows administrator to view and update everything', () => {
    const admin = makeUser(['administrator'])
    expect(currentUserCanAccessDynamicConfigNamespace(admin, moderatorEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(admin, moderatorEntry, 'update')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(admin, developerEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(admin, developerEntry, 'update')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(admin, noRolesEntry, 'update')).toBe(true)
  })

  it('allows developer to view all namespaces', () => {
    const developer = makeUser(['developer'])
    expect(currentUserCanAccessDynamicConfigNamespace(developer, moderatorEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(developer, developerEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(developer, noRolesEntry, 'view')).toBe(true)
  })

  it('allows developer to update developer namespaces but not moderator-only ones', () => {
    const developer = makeUser(['developer'])
    expect(currentUserCanAccessDynamicConfigNamespace(developer, developerEntry, 'update')).toBe(
      true,
    )
    expect(currentUserCanAccessDynamicConfigNamespace(developer, sharedEntry, 'update')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(developer, moderatorEntry, 'update')).toBe(
      false,
    )
  })

  it('allows moderator to view all namespaces', () => {
    const moderator = makeUser(['moderator'])
    expect(currentUserCanAccessDynamicConfigNamespace(moderator, developerEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(moderator, moderatorEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(moderator, noRolesEntry, 'view')).toBe(true)
  })

  it('allows moderator to update moderation namespaces but not developer-only ones', () => {
    const moderator = makeUser(['moderator'])
    expect(currentUserCanAccessDynamicConfigNamespace(moderator, moderatorEntry, 'update')).toBe(
      true,
    )
    expect(currentUserCanAccessDynamicConfigNamespace(moderator, sharedEntry, 'update')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(moderator, developerEntry, 'update')).toBe(
      false,
    )
  })

  it('allows investor to view but not update anything', () => {
    const investor = makeUser(['investor'])
    expect(currentUserCanAccessDynamicConfigNamespace(investor, moderatorEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(investor, developerEntry, 'view')).toBe(true)
    expect(currentUserCanAccessDynamicConfigNamespace(investor, moderatorEntry, 'update')).toBe(
      false,
    )
    expect(currentUserCanAccessDynamicConfigNamespace(investor, developerEntry, 'update')).toBe(
      false,
    )
    expect(currentUserCanAccessDynamicConfigNamespace(investor, noRolesEntry, 'update')).toBe(false)
  })

  it('keeps security-sensitive controls administrator-only', () => {
    const adminOnlyNamespaces = [
      'app-attestation-config',
      'recaptcha-config',
      'rate-limit-thresholds',
      'route-rate-limit-config',
      'contribution-rate-limits',
      'web-risk-config',
    ]

    for (const namespace of adminOnlyNamespaces) {
      const entry = getDynamicConfigRegistryEntry(namespace)
      if (entry === null) {
        throw new Error(`Missing registry entry: ${namespace}`)
      }
      expect(entry.access.update_roles).toEqual([])
      expect(
        currentUserCanAccessDynamicConfigNamespace(makeUser(['developer']), entry, 'update'),
      ).toBe(false)
      expect(
        currentUserCanAccessDynamicConfigNamespace(makeUser(['moderator']), entry, 'update'),
      ).toBe(false)
      expect(
        currentUserCanAccessDynamicConfigNamespace(makeUser(['administrator']), entry, 'update'),
      ).toBe(true)
    }
  })

  it('rejects users without any config roles from viewing or updating', () => {
    const regular = makeUser([])
    expect(currentUserCanAccessDynamicConfigNamespace(regular, developerEntry, 'view')).toBe(false)
    expect(currentUserCanAccessDynamicConfigNamespace(regular, developerEntry, 'update')).toBe(
      false,
    )
  })
})
