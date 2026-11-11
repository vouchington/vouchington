import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  getTestPrivateUserById,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import {
  expireTestCommunityRestrictionWhileFenceHeld,
  withHeldCommunityUpdateForTest,
  withCommunityRestrictionApplicationClockForTest,
} from '@voucha/test-helpers/community-restriction-writer-race'
import { callRejectedMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { countTestPostsCreatedBy } from '@voucha/test-helpers/entities/posts-deletion'
import {
  countTestCommunityRestrictions,
  getTestCommunityRestriction,
} from '@voucha/test-helpers/entities/community-restrictions'
import {
  withConcurrentActorDeletionForTest,
  withConcurrentCommunityArchiveForTest,
  withConcurrentCommunityMembershipRemovalForTest,
} from '@voucha/test-helpers/post-delegated-write-race'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { withAbortedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-aborted-transaction'
import { lockCommunityRestrictionWrites } from './lock.mts'
import { activateCommunityRestrictions } from './activate.mts'
import { liftCommunityRestriction } from './lift.mts'
import { getActiveCommunityRestrictions } from './get.mts'
import { loadCommunityWithViewer } from '../load-with-viewer.mts'

async function fixture() {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
  return {
    currentUser: (await getTestPrivateUserById(user.id))!,
    community,
    loaded: await loadCommunityWithViewer(community.id, user.id),
  }
}

describe('community restriction writers and concurrent settings writes', () => {
  it('uses database expiry time when the application clock trails PostgreSQL', async () => {
    const { currentUser, loaded, community } = await fixture()
    const expiresAt = new Date(Date.now() - 1000)
    await withCommunityRestrictionApplicationClockForTest(
      new Date(expiresAt.getTime() - 1000),
      async () => {
        await expect(
          withHeldCommunityUpdateForTest(community.id, () =>
            activateCommunityRestrictions(currentUser, loaded, {
              restrictionTypes: ['no_links'],
              expiresAt,
            }),
          ),
        ).rejects.toMatchObject({ status: 422, message: 'expires_at must be in the future' })
        expect(await countTestCommunityRestrictions(community.id)).toBe(0)
        expect(await readStaffActionHistory(currentUser.id)).toEqual([])
      },
    )
  })
  it('propagates actual transaction faults without misclassifying the moderator', async () => {
    const { currentUser, community } = await fixture()
    await expect(
      withAbortedPostgresTransactionForTest(({ query }) =>
        lockCommunityRestrictionWrites(query, community.id, currentUser.id),
      ),
    ).rejects.toMatchObject({ code: '25P02' })
  })
  it('does not manually lift a restriction that expires while waiting for the fence', async () => {
    const { currentUser, loaded, community } = await fixture()
    const [restriction] = await activateCommunityRestrictions(currentUser, loaded, {
      restrictionTypes: ['no_links'],
      expiresAt: null,
    })
    const history = await readStaffActionHistory(currentUser.id)
    await expect(
      withHeldCommunityUpdateForTest(
        community.id,
        () => liftCommunityRestriction(currentUser, loaded, restriction!.id),
        {
          beforeRelease: query =>
            expireTestCommunityRestrictionWhileFenceHeld(query, community.id, restriction!.id),
        },
      ),
    ).rejects.toMatchObject({ status: 404, message: 'No active restriction found' })
    expect((await getTestCommunityRestriction(restriction!.id)).lifted_at).toBeNull()
    expect(await readStaffActionHistory(currentUser.id)).toEqual(history)
  })
  it('refuses activation when community archiving wins the fence', async () => {
    const { currentUser, loaded, community } = await fixture()
    await expect(
      withConcurrentCommunityArchiveForTest(
        community.id,
        () =>
          activateCommunityRestrictions(currentUser, loaded, {
            restrictionTypes: ['no_links'],
            expiresAt: null,
          }),
        'lockCommunityRestrictionWrites',
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
    expect(await countTestCommunityRestrictions(community.id)).toBe(0)
    expect(await readStaffActionHistory(currentUser.id)).toEqual([])
  })
  it('refuses activation when moderator deletion wins its lifecycle fence', async () => {
    const { currentUser, loaded, community } = await fixture()
    await expect(
      withConcurrentActorDeletionForTest(currentUser.id, () =>
        activateCommunityRestrictions(currentUser, loaded, {
          restrictionTypes: ['no_links'],
          expiresAt: null,
        }),
      ),
    ).rejects.toMatchObject({ status: 401, message: 'User not found' })
    expect(await countTestCommunityRestrictions(community.id)).toBe(0)
    expect(await readStaffActionHistory(currentUser.id)).toEqual([])
  })
  it('activation waits until the community settings write releases', async () => {
    const { currentUser, loaded, community } = await fixture()
    const restrictions = await withHeldCommunityUpdateForTest(community.id, () =>
      activateCommunityRestrictions(currentUser, loaded, {
        restrictionTypes: ['require_post_approval'],
        expiresAt: null,
      }),
    )
    expect(restrictions).toHaveLength(1)
    expect(await getActiveCommunityRestrictions(community.id, { readOnly: false })).toMatchObject([
      { id: restrictions[0]!.id, restriction_type: 'require_post_approval' },
    ])
  })
  it('refuses activation when moderator membership removal wins its row fence', async () => {
    const { currentUser, loaded, community } = await fixture()
    await expect(
      withConcurrentCommunityMembershipRemovalForTest(
        community.id,
        currentUser.id,
        () =>
          activateCommunityRestrictions(currentUser, loaded, {
            restrictionTypes: ['no_links'],
            expiresAt: null,
          }),
        'lockCommunityRestrictionWrites.membership',
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
    expect(await countTestCommunityRestrictions(community.id)).toBe(0)
    expect(await readStaffActionHistory(currentUser.id)).toEqual([])
  })
  it('lifting waits until the community settings write releases', async () => {
    const { currentUser, loaded, community } = await fixture()
    const [restriction] = await activateCommunityRestrictions(currentUser, loaded, {
      restrictionTypes: ['no_links'],
      expiresAt: null,
    })
    await withHeldCommunityUpdateForTest(community.id, () =>
      liftCommunityRestriction(currentUser, loaded, restriction!.id),
    )
    expect(await getActiveCommunityRestrictions(community.id, { readOnly: false })).toEqual([])
  })
  it('a committed no-links activation governs the next delegated contribution', async () => {
    const { currentUser, loaded, community } = await fixture()
    const member = await createTestUser()
    await createTestMembership({ user_id: member.id, plan: 'plus' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })
    await activateCommunityRestrictions(currentUser, loaded, {
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
