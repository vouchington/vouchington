import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'

import {
  hasTestRetainedIdentityRoot,
  insertTestRetainedIdentityRoot,
  createTestMembership,
  createTestRetentionWindow,
  createTestUser,
  getTestMembershipRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { readTestRetainedMembershipChangeIds } from '@voucha/test-helpers/entities/retained-identities'
import {
  insertMembershipRowReferencingUser,
  membershipRetainedUserReferences,
} from '@voucha/test-helpers/data-stores/psql/membership-retained-user-references'

import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

const membershipLedgers = [
  ['membership_changes', 'user_id'],
  ['membership_refunds', 'user_id'],
  ['membership_administrator_refund_operation_requests', 'issued_by_id'],
] as const

describe('retained user identity cleanup for membership lineage', () => {
  it.each(membershipLedgers)(
    'keeps a membership root referenced only by %s',
    async (table, column) => {
      const id = v7()
      const user = await createTestUser()
      await insertTestRetainedIdentityRoot('membership', id)
      await insertMembershipRowReferencingUser([table, column], user.id, id)
      await cleanupRetainedIdentityRoots(1_000, { membership: [id] })
      expect(await hasTestRetainedIdentityRoot('membership', id)).toBe(true)
    },
  )

  it.each(membershipLedgers)(
    'rejects %s without a registered membership identity',
    async (table, column) => {
      const user = await createTestUser()
      await expect(
        insertMembershipRowReferencingUser([table, column], user.id, v7()),
      ).rejects.toMatchObject({
        code: '23503',
        detail: expect.stringContaining('retained_membership_identities'),
      })
    },
  )

  it('reclaims an unreferenced membership identity', async () => {
    const id = v7()
    await insertTestRetainedIdentityRoot('membership', id)
    await cleanupRetainedIdentityRoots(1_000, { membership: [id] })
    expect(await hasTestRetainedIdentityRoot('membership', id)).toBe(false)
  })

  it('keeps membership history after final user purge removes the live projection', async () => {
    const user = await createTestUser()
    const membership = await createTestMembership({ user_id: user.id })
    const history = await readTestRetainedMembershipChangeIds(membership.id)
    expect(history.length).toBeGreaterThan(0)
    expect(await hasTestRetainedIdentityRoot('membership', membership.id)).toBe(true)
    await cleanupRetainedIdentityRoots(1_000, { membership: [membership.id] })
    expect(await getTestMembershipRaw(membership.id)).toBeDefined()
    const window = createTestRetentionWindow()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    let result: { hasMore: boolean }
    do {
      result = await cleanupSoftDeletedUser(user.id, window.upperBoundDate, window.lowerBoundDate)
    } while (result.hasMore)
    expect(await getTestMembershipRaw(membership.id)).toBeUndefined()
    expect(await readTestRetainedMembershipChangeIds(membership.id)).toEqual(history)
    await cleanupRetainedIdentityRoots(1_000, { membership: [membership.id] })
    expect(await hasTestRetainedIdentityRoot('membership', membership.id)).toBe(true)
  }, 60_000)

  it.each(membershipRetainedUserReferences)(
    'keeps a root referenced only by %s.%s',
    async (table, column) => {
      const id = v7()
      await insertTestRetainedIdentityRoot('user', id)
      await insertMembershipRowReferencingUser([table, column], id)

      await cleanupRetainedIdentityRoots(1_000, { user: [id] })
      expect(await hasTestRetainedIdentityRoot('user', id)).toBe(true)
    },
  )
})
