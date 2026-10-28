import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getTestPostgresBackendProcessId,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
  updateTestCommunityMemberRole,
} from '@voucha/test-helpers'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { banUserFromCommunity } from '../bans/create.mts'
import { getActiveCommunityBan } from '../bans/get.mts'
import { liftCommunityBan } from '../bans/lift.mts'
import { lockCommunityUser } from '../bans/lock.mts'
import { getCommunityMember } from '../members/get.mts'
import { removeMember } from '../members/remove.mts'
import { updateMemberRole } from '../members/update-role.mts'
import { initiateOwnershipTransfer } from '../ownership-transfer.mts'

describe('community membership role locks', () => {
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

    await withHeldCommunityUserWait({
      holderProcessId: await holderProcessId.promise,
      communityId: community.id,
      userId: target.id,
      releaseHolder: async () => {
        release.resolve()
        await holder
      },
      start: () => updateMemberRole(owner.id, community, target.id, 'moderator'),
      whileBlocked: async () => {
        const beforeRelease = await getCommunityMember(community.id, target.id)
        expect(beforeRelease?.role).toBe('member')
      },
    })
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

    await withHeldCommunityUserWait({
      holderProcessId: await holderProcessId.promise,
      communityId: community.id,
      userId: target.id,
      releaseHolder: async () => {
        release.resolve()
        await holder
      },
      start: () => removeMember(owner.id, community, target.id),
      whileBlocked: async () => {
        const beforeRelease = await getCommunityMember(community.id, target.id)
        expect(beforeRelease).not.toBeNull()
      },
    })
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

    await withHeldCommunityUserWait({
      holderProcessId: await holderProcessId.promise,
      communityId: community.id,
      userId: target.id,
      releaseHolder: async () => {
        release.resolve()
        await holder
      },
      start: () => initiateOwnershipTransfer(owner.id, community, target.id),
      whileBlocked: async () => {
        const beforeRelease = await getCommunityMember(community.id, target.id)
        expect(beforeRelease?.role).toBe('moderator')
      },
    })
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

    const banRejection = await withHeldCommunityUserWait({
      holderProcessId: await holderProcessId.promise,
      communityId: community.id,
      userId: moderator.id,
      releaseHolder: async () => {
        demote.resolve()
        await holder
      },
      start: () =>
        banUserFromCommunity(moderator, community.id, target.id).catch((err: unknown) => err),
    })

    expect(banRejection).toMatchObject({ status: 403 })
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

    const liftRejection = await withHeldCommunityUserWait({
      holderProcessId: await holderProcessId.promise,
      communityId: community.id,
      userId: moderator.id,
      releaseHolder: async () => {
        demote.resolve()
        await holder
      },
      start: () =>
        liftCommunityBan(moderator, community.id, target.id).catch((err: unknown) => err),
    })

    expect(liftRejection).toMatchObject({ status: 403 })
    const activeBan = await getActiveCommunityBan(community.id, target.id)
    expect(activeBan).not.toBeNull()
    const moderatorMembership = await getCommunityMember(community.id, moderator.id)
    expect(moderatorMembership?.role).toBe('member')
  })
})

async function withHeldCommunityUserWait<Result>(input: {
  holderProcessId: number
  communityId: string
  userId: string
  releaseHolder: () => Promise<void>
  start: () => Promise<Result>
  whileBlocked?: () => Promise<void>
}): Promise<Result> {
  return withTestOwnedPostgresWait(
    {
      holderProcessId: input.holderProcessId,
      pool: 'write',
      lock: { kind: 'advisory', key: `${input.communityId}:${input.userId}` },
      queryMarker: 'lockCommunityUsers',
      releaseHolder: input.releaseHolder,
    },
    async waitForLock => {
      const action = input.start()
      await waitForLock(action)
      await input.whileBlocked?.()
      await input.releaseHolder()
      return action
    },
  )
}

async function createOwnerAndTarget(role: 'member' | 'moderator') {
  const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
  const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
    insertTestCommunityMember({ communityId: community.id, userId: target!.id, role }),
  ])
  return { owner: owner!, target: target!, community }
}
