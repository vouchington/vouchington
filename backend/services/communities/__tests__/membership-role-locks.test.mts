import type { QueryExecutor } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getTestPostgresBackendProcessId,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
  waitForTestPostgresLockWaiter,
  updateTestCommunityMemberRole,
} from '@voucha/test-helpers'
import { banUserFromCommunity } from '../bans/create.mts'
import { getActiveCommunityBan } from '../bans/get.mts'
import { liftCommunityBan } from '../bans/lift.mts'
import { lockCommunityUser, lockCommunityUsers } from '../bans/lock.mts'
import { getCommunityMember } from '../members/get.mts'
import { removeMember } from '../members/remove.mts'
import { updateMemberRole } from '../members/update-role.mts'
import { initiateOwnershipTransfer } from '../ownership-transfer.mts'

describe('community membership role locks', () => {
  it('locks reversed duplicate user inputs concurrently without deadlocking', async () => {
    const { owner, target, community } = await createOwnerAndTarget('member')
    const release = Promise.withResolvers<void>()
    const firstAcquiredSignal = Promise.withResolvers<void>()
    const secondAcquiredSignal = Promise.withResolvers<void>()
    let firstAcquired = false
    let secondAcquired = false

    // Barrier both sides so their lockCommunityUsers statements dispatch to Postgres in the
    // same tick, instead of `first` (constructed first) getting an unbounded JS head start
    // that could let its whole combined-lock statement finish before `second` is even sent.
    // lockCommunityUsers acquires every key inside one combined MATERIALIZED-CTE statement
    // (see ../bans/lock.mts), issued as a single query per call — there is no per-key
    // acquisition hook exposed, so this dispatch barrier is the finest-grained interleaving
    // point this test can force without instrumenting lock.mts itself.
    const firstDispatching = Promise.withResolvers<void>()
    const secondDispatching = Promise.withResolvers<void>()

    const first = acquireFirstUserLocks()
    const second = acquireSecondUserLocks()

    async function acquireFirstUserLocks(): Promise<void> {
      await using query = await beginTransaction()
      const barrieredQuery: QueryExecutor = async (input, values) => {
        firstDispatching.resolve()
        await secondDispatching.promise
        return query(input, values)
      }
      await lockCommunityUsers(community.id, [owner.id, target.id, owner.id], {
        query: barrieredQuery,
      })
      firstAcquired = true
      firstAcquiredSignal.resolve()
      await release.promise

      await query.commit()
    }

    async function acquireSecondUserLocks(): Promise<void> {
      await using query = await beginTransaction()
      const barrieredQuery: QueryExecutor = async (input, values) => {
        secondDispatching.resolve()
        await firstDispatching.promise
        return query(input, values)
      }
      await lockCommunityUsers(community.id, [target.id, owner.id, target.id], {
        query: barrieredQuery,
      })
      secondAcquired = true
      secondAcquiredSignal.resolve()
      await release.promise

      await query.commit()
    }

    try {
      // Wait for whichever side actually wins the race to acquire, instead of a fixed delay —
      // a loaded database fork can take longer than any fixed sleep to grant either lock, and
      // a fixed delay would then fail this assertion despite correct locking. The loser
      // genuinely cannot acquire the same advisory lock keys while the winner's transaction
      // still holds them open (blocked below on `release.promise`), so as soon as one signal
      // fires, the other side is deterministically still waiting.
      await Promise.race([firstAcquiredSignal.promise, secondAcquiredSignal.promise])
      expect(firstAcquired).not.toBe(secondAcquired)
    } finally {
      // Always release, even if the assertion above throws — otherwise whichever transaction
      // eventually acquires the locks would hang forever awaiting `release.promise`, turning a
      // simple assertion failure into a test timeout and a leaked pool connection.
      release.resolve()
    }

    await Promise.all([first, second])
    expect(firstAcquired).toBe(true)
    expect(secondAcquired).toBe(true)
  })

  it('updateMemberRole waits for the target user advisory lock', async () => {
    const { owner, target, community } = await createOwnerAndTarget('member')
    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()
    const holder = holdTargetUserLock()

    async function holdTargetUserLock(): Promise<void> {
      await using query = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(query))
      await lockCommunityUser(community.id, target.id, { query })
      ready.resolve()
      await release.promise

      await query.commit()
    }
    await ready.promise

    const update = updateMemberRole(owner.id, community.id, target.id, 'moderator')
    try {
      await waitForTestPostgresLockWaiter(await holderProcessId.promise, 'lockCommunityUsers')
      const beforeRelease = await getCommunityMember(community.id, target.id)
      expect(beforeRelease?.role).toBe('member')
    } finally {
      release.resolve()
      await Promise.allSettled([holder, update])
    }
    await update
    const afterRelease = await getCommunityMember(community.id, target.id)
    expect(afterRelease?.role).toBe('moderator')
  })

  it('removeMember waits for the target user advisory lock', async () => {
    const { owner, target, community } = await createOwnerAndTarget('member')
    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()
    const holder = holdTargetUserLock()

    async function holdTargetUserLock(): Promise<void> {
      await using query = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(query))
      await lockCommunityUser(community.id, target.id, { query })
      ready.resolve()
      await release.promise

      await query.commit()
    }
    await ready.promise

    const removal = removeMember(owner.id, community.id, target.id)
    try {
      await waitForTestPostgresLockWaiter(await holderProcessId.promise, 'lockCommunityUsers')
      const beforeRelease = await getCommunityMember(community.id, target.id)
      expect(beforeRelease).not.toBeNull()
    } finally {
      release.resolve()
      await Promise.allSettled([holder, removal])
    }
    await removal
    const afterRelease = await getCommunityMember(community.id, target.id)
    expect(afterRelease).toBeNull()
  })

  it('ownership transfer waits for the target user advisory lock', async () => {
    const { owner, target, community } = await createOwnerAndTarget('moderator')
    const ready = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()
    const holder = holdTargetUserLock()

    async function holdTargetUserLock(): Promise<void> {
      await using query = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(query))
      await lockCommunityUser(community.id, target.id, { query })
      ready.resolve()
      await release.promise

      await query.commit()
    }
    await ready.promise

    const transfer = initiateOwnershipTransfer(owner.id, community.id, target.id)
    try {
      await waitForTestPostgresLockWaiter(await holderProcessId.promise, 'lockCommunityUsers')
      const beforeRelease = await getCommunityMember(community.id, target.id)
      expect(beforeRelease?.role).toBe('moderator')
    } finally {
      release.resolve()
      await Promise.allSettled([holder, transfer])
    }
    await transfer
    const afterRelease = await getCommunityMember(community.id, target.id)
    expect(afterRelease?.role).toBe('owner')
  })

  it('banUserFromCommunity rechecks moderator authority after the actor lock releases', async () => {
    const { target, community } = await createOwnerAndTarget('member')
    const moderator = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const ready = Promise.withResolvers<void>()
    const demote = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()
    const holder = holdModeratorLockUntilDemoted()

    async function holdModeratorLockUntilDemoted(): Promise<void> {
      await using query = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(query))
      const options = { query }
      await lockCommunityUser(community.id, moderator.id, options)
      ready.resolve()
      await demote.promise
      await updateTestCommunityMemberRole(community.id, moderator.id, 'member', options)

      await query.commit()
    }
    await ready.promise

    const ban = banUserFromCommunity(moderator, community.id, target.id)
    const banRejection = ban.catch((error: unknown) => error)
    try {
      await waitForTestPostgresLockWaiter(await holderProcessId.promise, 'lockCommunityUsers')
    } finally {
      demote.resolve()
      await Promise.allSettled([holder, banRejection])
    }

    await expect(banRejection).resolves.toMatchObject({ status: 403 })
    const activeBan = await getActiveCommunityBan(community.id, target.id)
    expect(activeBan).toBeNull()
    const targetMembership = await getCommunityMember(community.id, target.id)
    expect(targetMembership?.role).toBe('member')
    const moderatorMembership = await getCommunityMember(community.id, moderator.id)
    expect(moderatorMembership?.role).toBe('member')
  })

  it('liftCommunityBan rechecks moderator authority after the actor lock releases', async () => {
    const { target, community } = await createOwnerAndTarget('member')
    const moderator = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: moderator.id,
    })
    const ready = Promise.withResolvers<void>()
    const demote = Promise.withResolvers<void>()
    const holderProcessId = Promise.withResolvers<number>()
    const holder = holdModeratorLockUntilDemoted()

    async function holdModeratorLockUntilDemoted(): Promise<void> {
      await using query = await beginTransaction()
      holderProcessId.resolve(await getTestPostgresBackendProcessId(query))
      const options = { query }
      await lockCommunityUser(community.id, moderator.id, options)
      ready.resolve()
      await demote.promise
      await updateTestCommunityMemberRole(community.id, moderator.id, 'member', options)

      await query.commit()
    }
    await ready.promise

    const lift = liftCommunityBan(moderator, community.id, target.id)
    const liftRejection = lift.catch((error: unknown) => error)
    try {
      await waitForTestPostgresLockWaiter(await holderProcessId.promise, 'lockCommunityUsers')
    } finally {
      demote.resolve()
      await Promise.allSettled([holder, liftRejection])
    }

    await expect(liftRejection).resolves.toMatchObject({ status: 403 })
    const activeBan = await getActiveCommunityBan(community.id, target.id)
    expect(activeBan).not.toBeNull()
    const moderatorMembership = await getCommunityMember(community.id, moderator.id)
    expect(moderatorMembership?.role).toBe('member')
  })
})

async function createOwnerAndTarget(role: 'member' | 'moderator') {
  const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
  const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
    insertTestCommunityMember({ communityId: community.id, userId: target!.id, role }),
  ])
  return { owner: owner!, target: target!, community }
}
