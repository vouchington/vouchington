import { expect, it, describe } from 'vitest'
import {
  upsertSystemAdministrator,
  upsertSystemUser,
  upsertAdminEmailAddresses,
  getUserByPrimaryEmail,
} from './system-users.mts'
import { getPrivateUserByAny } from './get.mts'
import { createTestUserDirect, getTestUserRaw, safeUsername } from '@voucha/test-helpers'

describe('upsertSystemAdministrator', () => {
  it('ensures administrator role on existing user', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const username = `system-admin-${random}`

    const user = await upsertSystemAdministrator(username)
    await upsertSystemAdministrator(username)

    const refreshed = await getPrivateUserByAny(user.id)
    expect(refreshed?.roles).toContain('administrator')
  })
})

describe('upsertSystemUser', () => {
  it('creates a system user without any roles', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const username = `system-user-${random}`

    const user = await upsertSystemUser(username)
    expect(user.username).toBe(username)

    const refreshed = await getPrivateUserByAny(user.id)
    expect(refreshed?.roles).toHaveLength(0)
  })

  it('is idempotent — second call does not error', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const username = `system-user-${random}`

    const first = await upsertSystemUser(username)
    const second = await upsertSystemUser(username)

    expect(first.id).toBe(second.id)
  })

  // Security regression: PATCH /api/v1/my/identity lets any authenticated user rename
  // themselves to a reserved username before a deploy runs the system-user seed. Reclaim must
  // rename the squatter out of the way (never delete/merge them) and hand the reserved
  // username to a fresh is_system row, so the squatter never inherits the system identity.
  it('reclaims a reserved username from a non-system squatter', async () => {
    const username = safeUsername('reclaim-target')
    const squatter = await createTestUserDirect({ username })

    const systemUser = await upsertSystemUser(username)

    expect(systemUser.id).not.toBe(squatter!.id)
    expect(systemUser.username).toBe(username)

    const reclaimedSquatter = await getTestUserRaw(squatter!.id)
    expect(reclaimedSquatter?.username).toMatch(/^reclaimed-[0-9a-f]{32}$/)
    expect(reclaimedSquatter?.is_system).toBe(false)

    const systemRow = await getTestUserRaw(systemUser.id)
    expect(systemRow?.is_system).toBe(true)
  })

  it('does not touch an existing system user holding the username', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const username = `system-user-stable-${random}`

    const first = await upsertSystemUser(username)
    const second = await upsertSystemUser(username)

    expect(second.id).toBe(first.id)
    const row = await getTestUserRaw(first.id)
    expect(row?.username).toBe(username)
    expect(row?.is_system).toBe(true)
  })
})

describe('upsertAdminEmailAddresses', () => {
  it('inserts email addresses for a user and is idempotent', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await upsertSystemAdministrator(`email-test-${random}`)

    const emails = [
      { email: `tests+primary-${random}@voucha.ai`, isPrimary: true },
      { email: `tests+secondary-${random}@voucha.ai`, isPrimary: false },
    ]

    // Run twice to verify idempotency
    await upsertAdminEmailAddresses(user.id, emails)
    await upsertAdminEmailAddresses(user.id, emails)

    // Primary email is visible via the private user view
    const refreshed = await getPrivateUserByAny(user.id)
    expect(refreshed?.email_address).toBe(emails[0]!.email)

    // Secondary email can be used to look up the user
    const bySecondary = await getPrivateUserByAny(emails[1]!.email)
    expect(bySecondary?.id).toBe(user.id)
  })
})

describe('getUserByPrimaryEmail', () => {
  it('returns null when no user has the email', async () => {
    const result = await getUserByPrimaryEmail('tests+no-such-user@voucha.ai')
    expect(result).toBeNull()
  })

  it('returns the user when their primary email matches', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await upsertSystemUser(`primary-email-test-${random}`)
    await upsertAdminEmailAddresses(user.id, [
      { email: `tests+primary-${random}@voucha.ai`, isPrimary: true },
    ])

    const found = await getUserByPrimaryEmail(`tests+primary-${random}@voucha.ai`)
    expect(found?.id).toBe(user.id)
  })

  it('does not match on non-primary rows', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await upsertSystemUser(`non-primary-test-${random}`)
    await upsertAdminEmailAddresses(user.id, [
      { email: `tests+primary-${random}@voucha.ai`, isPrimary: true },
      { email: `tests+secondary-${random}@voucha.ai`, isPrimary: false },
    ])

    const result = await getUserByPrimaryEmail(`tests+secondary-${random}@voucha.ai`)
    expect(result).toBeNull()
  })
})
