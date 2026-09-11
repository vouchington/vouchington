import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'
import { countUserMemberCommunities, listUserMemberCommunities } from '../member-communities.mts'

describe('listUserMemberCommunities pagination', () => {
  it('applies community and roster visibility before the page limit', async () => {
    const target = await createTestUser()
    await updateUserFields(target.id, { community_memberships_visibility: 'everyone' })

    const visibleIds: string[] = []
    for (let index = 0; index < 5; index++) {
      const visible = index % 2 === 0
      const community = await insertTestCommunity({
        createdById: target.id,
        visibility: 'public',
        member_roster_visibility: visible ? 'public' : 'moderators',
      })
      if (visible) visibleIds.push(community.id)
      await insertTestCommunityMember({
        communityId: community.id,
        userId: target.id,
        role: 'member',
        createdAt: new Date(Date.now() - (10 - index) * 10_000),
      })
    }

    const first = await listUserMemberCommunities(target.id, null, { limit: 2 })
    const second = await listUserMemberCommunities(target.id, null, {
      limit: 2,
      after: first.page_info.end_cursor ?? undefined,
    })

    expect(first.results).toHaveLength(2)
    expect(first.page_info.has_next_page).toBe(true)
    expect(second.results).toHaveLength(1)
    expect(second.page_info.has_next_page).toBe(false)
    expect([...first.results, ...second.results].map(member => member.community_id)).toEqual(
      visibleIds,
    )
  })

  it('keeps list and count visibility aligned for anonymous, user, member, and admin viewers', async () => {
    const [target, viewer, memberViewer, admin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    if (!target || !viewer || !memberViewer || !admin) throw new Error('Failed to create users')
    await updateUserFields(target.id, { community_memberships_visibility: 'everyone' })

    const publicCommunity = await insertTestCommunity({
      createdById: target.id,
      visibility: 'public',
      member_roster_visibility: 'public',
    })
    const usersCommunity = await insertTestCommunity({
      createdById: target.id,
      visibility: 'public',
      member_roster_visibility: 'users',
    })
    const privateCommunity = await insertTestCommunity({
      createdById: target.id,
      visibility: 'private',
      member_roster_visibility: 'members',
    })
    await Promise.all([
      insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: target.id,
        role: 'member',
      }),
      insertTestCommunityMember({
        communityId: usersCommunity.id,
        userId: target.id,
        role: 'member',
      }),
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: target.id,
        role: 'member',
      }),
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: memberViewer.id,
        role: 'member',
      }),
    ])

    const viewers = [
      { viewer: null, expected: [publicCommunity.id] },
      { viewer, expected: [publicCommunity.id, usersCommunity.id] },
      {
        viewer: memberViewer,
        expected: [publicCommunity.id, usersCommunity.id, privateCommunity.id],
      },
      {
        viewer: admin,
        expected: [publicCommunity.id, usersCommunity.id, privateCommunity.id],
      },
    ]
    for (const testCase of viewers) {
      const list = await listUserMemberCommunities(target.id, testCase.viewer, { limit: 100 })
      const count = await countUserMemberCommunities(target.id, testCase.viewer)
      expect(list.results.map(member => member.community_id).sort()).toEqual(
        testCase.expected.sort(),
      )
      expect(count).toBe(list.results.length)
    }
  })
})
