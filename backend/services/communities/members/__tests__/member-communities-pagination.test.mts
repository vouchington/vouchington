import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'
import { countUserMemberCommunities, listUserMemberCommunities } from '../member-communities.mts'

describe('listUserMemberCommunities pagination', () => {
  it('returns every visible community across short pages when hidden communities sit between them', async () => {
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

    const seen: string[] = []
    let after: string | undefined
    let shortPage = false
    for (let step = 0; step < 8; step++) {
      const page = await listUserMemberCommunities(target.id, null, { limit: 2, after })
      seen.push(...page.results.map(member => member.community_id))
      if (page.results.length < 2 && page.page_info.has_next_page) shortPage = true
      if (!page.page_info.has_next_page) break
      expect(page.page_info.end_cursor).toBeTruthy()
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual(visibleIds)
    expect(shortPage).toBe(true)
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
      expect(list.results.map(member => member.community_id).toSorted()).toEqual(
        testCase.expected.toSorted(),
      )
      expect(count).toBe(list.results.length)
    }
  })
})
