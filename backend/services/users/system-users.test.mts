import { expect, it, describe } from 'vitest'
import { upsertSystemUser, getSystemUserForAuthorization } from './system-users.mts'
import { getPrivateUserByAny } from './get.mts'
import {
  createTestUserDirect,
  getTestUserRaw,
  getTestUserRoleSlugs,
  safeUsername,
} from '@voucha/test-helpers'

describe('getSystemUserForAuthorization', () => {
  it('loads the persisted role-free system actor', async () => {
    const username = safeUsername('system-actor')
    const systemUser = await upsertSystemUser(username)

    const actor = await getSystemUserForAuthorization(username)
    const persistedRoles = await getTestUserRoleSlugs(systemUser.id)

    expect(actor?.id).toBe(systemUser.id)
    expect(actor?.__entity_type).toBe('user')
    expect(persistedRoles).toEqual([])
    expect(actor?.account_type).toBe('system')
    expect(actor?.roles.toSorted()).toEqual(persistedRoles)
  })

  it('returns null for an unknown system username', async () => {
    await expect(
      getSystemUserForAuthorization(safeUsername('missing-system-actor')),
    ).resolves.toBeNull()
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
  // username to a fresh platform_account_kind row, so the squatter never inherits the system identity.
  it('reclaims a reserved username from a non-system squatter', async () => {
    const username = safeUsername('reclaim-target')
    const squatter = await createTestUserDirect({ username })

    const systemUser = await upsertSystemUser(username)

    expect(systemUser.id).not.toBe(squatter!.id)
    expect(systemUser.username).toBe(username)

    const reclaimedSquatter = await getTestUserRaw(squatter!.id)
    expect(reclaimedSquatter?.username).toMatch(/^reclaimed-[0-9a-f]{32}$/)
    expect(reclaimedSquatter?.platform_account_kind).toBeNull()

    const systemRow = await getTestUserRaw(systemUser.id)
    expect(systemRow?.platform_account_kind).toBe('system')
  })

  it('does not touch an existing system user holding the username', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const username = `system-user-stable-${random}`

    const first = await upsertSystemUser(username)
    const second = await upsertSystemUser(username)

    expect(second.id).toBe(first.id)
    const row = await getTestUserRaw(first.id)
    expect(row?.username).toBe(username)
    expect(row?.platform_account_kind).toBe('system')
  })
})
