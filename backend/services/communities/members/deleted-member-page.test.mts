import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  softDeleteUser,
} from '@voucha/test-helpers'
import { deleteTestCommunity } from '@voucha/test-helpers/entities/community-archive'
import { searchCommunityMembers } from './get.mts'
import { listUserMemberCommunities } from './member-communities.mts'

describe('deleted parent pages', () => {
  it('keeps later community members when a deleted user sits between them', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const liveBefore = await createTestUser()
    const deleted = await createTestUser()
    const liveAfter = await createTestUser()
    const start = Date.parse('2026-01-01T00:00:00Z')
    await insertTestCommunityMember({
      communityId: community.id,
      userId: liveBefore.id,
      createdAt: new Date(start),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: deleted.id,
      createdAt: new Date(start + 1_000),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: liveAfter.id,
      createdAt: new Date(start + 2_000),
    })
    await softDeleteUser(deleted.id)

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await searchCommunityMembers(community.id, { limit: 1, after })
      seen.push(...page.results.map(member => member.user_id))
      if (page.results.length === 0 && page.page_info.has_next_page) emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([liveBefore.id, liveAfter.id])
    expect(emptyContinuation).toBe(false)
  })

  it('keeps later communities when a deleted community sits between them', async () => {
    const member = await createTestUser()
    const start = Date.parse('2026-02-01T00:00:00Z')
    const communities = []
    for (let index = 0; index < 3; index++) {
      const community = await insertTestCommunity({ createdById: member.id, visibility: 'public' })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: member.id,
        role: 'member',
        createdAt: new Date(start + index * 1_000),
      })
      communities.push(community)
    }
    await deleteTestCommunity({ communityId: communities[1]!.id, deletedById: member.id })

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await listUserMemberCommunities(member.id, member, { limit: 1, after })
      seen.push(...page.results.map(row => row.community_id))
      if (page.results.length === 0 && page.page_info.has_next_page) emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([communities[0]!.id, communities[2]!.id])
    expect(emptyContinuation).toBe(false)
  })

  it('pages owners without returning regular members between them', async () => {
    const creator = await createTestUser()
    const community = await insertTestCommunity({ createdById: creator.id })
    const start = Date.parse('2026-03-01T00:00:00Z')
    const member = await createTestUser()
    const owners = [await createTestUser(), await createTestUser(), await createTestUser()]
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
      createdAt: new Date(start),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owners[0]!.id,
      role: 'owner',
      createdAt: new Date(start + 1_000),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owners[1]!.id,
      role: 'owner',
      createdAt: new Date(start + 2_000),
    })
    await softDeleteUser(owners[1]!.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owners[2]!.id,
      role: 'owner',
      createdAt: new Date(start + 3_000),
    })

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await searchCommunityMembers(community.id, { limit: 1, role: 'owner', after })
      seen.push(...page.results.map(row => row.user_id))
      if (page.results.length === 0 && page.page_info.has_next_page) emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([owners[0]!.id, owners[2]!.id])
    expect(emptyContinuation).toBe(false)
  })

  it('pages the moderator roster without regular members between them', async () => {
    const creator = await createTestUser()
    const community = await insertTestCommunity({ createdById: creator.id })
    const start = Date.parse('2026-03-02T00:00:00Z')
    const firstMember = await createTestUser()
    const owner = await createTestUser()
    const secondMember = await createTestUser()
    const moderator = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: firstMember.id,
      role: 'member',
      createdAt: new Date(start),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
      createdAt: new Date(start + 1_000),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: secondMember.id,
      role: 'member',
      createdAt: new Date(start + 2_000),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
      createdAt: new Date(start + 3_000),
    })

    const seen: string[] = []
    let after: string | undefined
    for (let step = 0; step < 6; step++) {
      const page = await searchCommunityMembers(community.id, {
        limit: 1,
        rosterVisibility: 'moderators',
        after,
      })
      seen.push(...page.results.map(row => row.user_id))
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([owner.id, moderator.id])
  })
})
