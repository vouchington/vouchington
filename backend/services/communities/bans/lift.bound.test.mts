import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { Community } from '../types.mts'
import type { PrivateUser } from '@services/users/types'
import { communitiesWorkConfig } from '../work-limits.mts'
import { getActiveCommunityBan, getCommunityBanById } from './get.mts'
import { liftAllCommunityBans, liftCommunityBan } from './lift.mts'
import { listActiveCommunityBans } from './search.mts'
import { encodeCursor } from '@modules/pagination'

describe('bounded community ban lifts and active pages', () => {
  let owner: PrivateUser
  let moderator: PrivateUser
  let community: Community

  beforeAll(async () => {
    const [createdOwner, createdModerator] = await Promise.all([createTestUser(), createTestUser()])
    owner = createdOwner
    moderator = createdModerator
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])
  })

  it('single lift leaves a sibling active and lift-all returns both ids', async () => {
    const user = await createTestUser()
    const first = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })
    const second = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })
    const single = await liftCommunityBan(owner, community.id, first.id)
    expect(single.lifted_ban_ids).toEqual([first.id])
    expect((await getActiveCommunityBan(community.id, user.id))?.id).toBe(second.id)
    const all = await liftAllCommunityBans(owner, community.id, user.id)
    expect(all.lifted_ban_ids).toEqual([second.id])
  })

  it('lift-all rejects over-cap without lifting any row', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communitiesWorkConfig, { lift_all_active_ban_limit: 1 }),
    )
    const user = await createTestUser()
    const first = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })
    const second = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })
    await expect(liftAllCommunityBans(owner, community.id, user.id)).rejects.toMatchObject({
      status: 409,
      code: 'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED',
      cap: 1,
    })
    expect((await getCommunityBanById(first.id))?.lifted_at).toBeNull()
    expect((await getCommunityBanById(second.id))?.lifted_at).toBeNull()
  })

  it('lift-all rejects a protected issuer atomically with a distinct code', async () => {
    const user = await createTestUser()
    const ordinary = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: moderator.id,
    })
    const protectedBan = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })
    await expect(liftAllCommunityBans(moderator, community.id, user.id)).rejects.toMatchObject({
      status: 403,
      code: 'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN',
    })
    expect((await getCommunityBanById(ordinary.id))?.lifted_at).toBeNull()
    expect((await getCommunityBanById(protectedBan.id))?.lifted_at).toBeNull()
  })

  it('active pages skip expired history and scope far-future expiry cursors to the user', async () => {
    const [user, other] = await Promise.all([createTestUser(), createTestUser()])
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      expiresAt: new Date(Date.now() - 1000),
    })
    const first = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      expiresAt: new Date('+010000-01-01T00:00:00.000Z'),
    })
    const second = await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
    })
    const page = await listActiveCommunityBans(community.id, user.id, { limit: 1 })
    expect(page.results.map(b => b.id)).toEqual([first.id])
    expect(page.results[0]).not.toHaveProperty('reason')
    const next = await listActiveCommunityBans(community.id, user.id, {
      limit: 1,
      after: page.page_info.end_cursor!,
    })
    expect(next.results.map(b => b.id)).toEqual([second.id])
    await expect(
      listActiveCommunityBans(community.id, other.id, { after: page.page_info.end_cursor! }),
    ).rejects.toMatchObject({ status: 422 })
    for (const expiry of ['1', '2026-02-31 00:00:00+00', '0000-01-01 00:00:00+00']) {
      const after = encodeCursor({
        name: `community-active-bans:${community.id}:${user.id}:${expiry}`,
        id: first.id,
      })
      await expect(listActiveCommunityBans(community.id, user.id, { after })).rejects.toMatchObject(
        { status: 422 },
      )
    }
  })
})
