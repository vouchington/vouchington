import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { communitiesWorkConfig } from '@services/communities/work-limits'

describe('community ban lift-all REST errors', () => {
  it('rejects a moderator when one issuer is protected and leaves both bans active', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const target = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const protectedBan = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: owner.id,
    })
    const otherBan = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: moderator.id,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)
    const path = `/api/v1/communities/${community.slug}/bans/users/${target.id}`
    const response = await request.delete(path).expect(403)
    expect(response.body).toMatchObject({
      code: 'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN',
      message: 'COMMUNITY_BAN_LIFT_ALL_FORBIDDEN',
    })
    const page = await request.get(path).expect(200)
    expect(page.body.results).toEqual(
      expect.arrayContaining([
        { __entity_type: 'community_ban', id: protectedBan.id },
        { __entity_type: 'community_ban', id: otherBan.id },
      ]),
    )
    expect(page.body.results).toHaveLength(2)
  })

  it('returns a numeric cap on overflow and leaves both bans active', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communitiesWorkConfig, { lift_all_active_ban_limit: 1 }),
    )
    const owner = await createTestUser()
    const target = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const first = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: owner.id,
    })
    const second = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: owner.id,
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const path = `/api/v1/communities/${community.slug}/bans/users/${target.id}`
    const response = await request.delete(path).expect(409)
    expect(response.body).toMatchObject({
      code: 'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED',
      message: 'COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED',
      cap: 1,
    })
    const page = await request.get(path).expect(200)
    expect(page.body.results).toEqual(
      expect.arrayContaining([
        { __entity_type: 'community_ban', id: first.id },
        { __entity_type: 'community_ban', id: second.id },
      ]),
    )
    expect(page.body.results).toHaveLength(2)
  })
})
