import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPrivateUserById,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestCommunityRestriction } from '@voucha/test-helpers/entities/community-restrictions'
import { getActiveCommunityRestrictions } from './get.mts'
import { getCommunityPostRestrictionDecision } from './enforce.mts'
import { COMMUNITY_RESTRICTION_TYPES } from './types.mts'

describe('active community restriction enforcement projection', () => {
  it('keeps the earliest active restriction per type and excludes unrelated history', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const otherCommunity = await insertTestCommunity({ createdById: user.id })
    const early = new Date('2020-01-01T00:00:00Z')
    const later = new Date('2020-01-03T00:00:00Z')
    const expectedIds: string[] = []
    for (const restrictionType of COMMUNITY_RESTRICTION_TYPES) {
      const input = {
        communityId: community.id,
        restrictionType,
        activatedById: user.id,
      }
      await insertTestCommunityRestriction({ ...input, activatedAt: later })
      const first = await insertTestCommunityRestriction({ ...input, activatedAt: early })
      const tied = await insertTestCommunityRestriction({ ...input, activatedAt: early })
      expectedIds.push([first.id, tied.id].toSorted()[0]!)
      await insertTestCommunityRestriction({
        ...input,
        activatedAt: new Date('2019-01-01T00:00:00Z'),
        expiresAt: new Date('2019-01-02T00:00:00Z'),
      })
      await insertTestCommunityRestriction({
        ...input,
        activatedAt: new Date('2019-01-01T00:00:00Z'),
        liftedAt: new Date('2019-01-02T00:00:00Z'),
        liftedById: user.id,
      })
      await insertTestCommunityRestriction({ ...input, communityId: otherCommunity.id })
    }
    const restrictions = await getActiveCommunityRestrictions(community.id, { readOnly: false })
    expect(restrictions.map(restriction => restriction.id)).toEqual(expectedIds.toSorted())
    expect(restrictions.map(restriction => restriction.restriction_type).toSorted()).toEqual(
      [...COMMUNITY_RESTRICTION_TYPES].toSorted(),
    )
  })

  it('retains the earliest no-new-member cutoff when a later duplicate would permit posting', async () => {
    const creator = await createTestUser()
    const user = await createTestUser()
    const currentUser = (await getTestPrivateUserById(user.id))!
    const community = await insertTestCommunity({ createdById: creator.id })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      createdAt: new Date('2020-01-02T00:00:00Z'),
    })
    for (const activatedAt of [
      new Date('2020-01-03T00:00:00Z'),
      new Date('2020-01-01T00:00:00Z'),
    ]) {
      await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_new_member_posts',
        activatedById: creator.id,
        activatedAt,
      })
    }
    await expect(
      getCommunityPostRestrictionDecision({
        communityId: community.id,
        currentUser,
        membership,
        updates: {},
        options: { readOnly: false },
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'New members are temporarily blocked from posting in this community',
    })
  })
})
