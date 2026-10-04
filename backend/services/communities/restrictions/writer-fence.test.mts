import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  getTestPrivateUserById,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { withHeldDelegatedCommunityFenceForTest } from '@voucha/test-helpers/community-restriction-writer-race'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { countTestPostsCreatedBy } from '@voucha/test-helpers/entities/posts-deletion'
import { activateCommunityRestrictions } from './activate.mts'
import { liftCommunityRestriction } from './lift.mts'
import { getActiveCommunityRestrictions } from './get.mts'

async function fixture() {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
  return { currentUser: (await getTestPrivateUserById(user.id))!, community }
}

describe('community restriction writers share delegated post fences', () => {
  it('activation waits until the delegated community fence releases', async () => {
    const { currentUser, community } = await fixture()
    const restrictions = await withHeldDelegatedCommunityFenceForTest(
      community.id,
      currentUser.id,
      () =>
        activateCommunityRestrictions(currentUser, community.id, {
          restrictionTypes: ['require_post_approval'],
          expiresAt: null,
        }),
    )
    expect(restrictions).toHaveLength(1)
    expect(await getActiveCommunityRestrictions(community.id, { readOnly: false })).toMatchObject([
      { id: restrictions[0]!.id, restriction_type: 'require_post_approval' },
    ])
  })
  it('lifting waits until the delegated community fence releases', async () => {
    const { currentUser, community } = await fixture()
    const [restriction] = await activateCommunityRestrictions(currentUser, community.id, {
      restrictionTypes: ['no_links'],
      expiresAt: null,
    })
    await withHeldDelegatedCommunityFenceForTest(community.id, currentUser.id, () =>
      liftCommunityRestriction(currentUser, community.id, restriction!.id),
    )
    expect(await getActiveCommunityRestrictions(community.id, { readOnly: false })).toEqual([])
  })
  it('a committed no-links activation governs the next delegated contribution', async () => {
    const { currentUser, community } = await fixture()
    const member = await createTestUser()
    await createTestMembership({ user_id: member.id, plan: 'plus' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })
    await activateCommunityRestrictions(currentUser, community.id, {
      restrictionTypes: ['no_links'],
      expiresAt: null,
    })
    const result = await callRejectedMcpTool(
      { ...member, membership_plan: 'plus' },
      'create_post',
      {
        idempotency_key: crypto.randomUUID(),
        community_id: community.id,
        title: 'Linked discussion',
        markdown: '[Source](https://example.test/source)',
      },
      ['posts:read', 'posts:write'],
    )
    expect(result).toContain('Links are temporarily blocked')
    expect(await countTestPostsCreatedBy(member.id)).toBe(0)
  })
})
