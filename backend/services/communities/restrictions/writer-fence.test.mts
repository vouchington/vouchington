import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  getTestPrivateUserById,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import {
  withHeldDelegatedCommunityFenceForTest,
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
  withConcurrentActorSuspensionForTest,
  withConcurrentCommunityArchiveForTest,
  withConcurrentCommunityMembershipRemovalForTest,
} from '@voucha/test-helpers/post-delegated-write-race'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { withAbortedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-aborted-transaction'
import { lockCommunityRestrictionWrites } from './lock.mts'
import { activateCommunityRestrictions } from './activate.mts'
import { liftCommunityRestriction } from './lift.mts'
import { getActiveCommunityRestrictions } from './get.mts'

async function fixture() {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
  const delegate = await createTestUser()
  await insertTestCommunityMember({
    communityId: community.id,
    userId: delegate.id,
    role: 'member',
  })
  return {
    currentUser: (await getTestPrivateUserById(user.id))!,
    community,
    delegateActorId: delegate.id,
  }
}

describe('community restriction writers share delegated post fences', () => {
  it('uses database expiry time when the application clock trails PostgreSQL', async () => {
    const { currentUser, community } = await fixture()
    const expiresAt = new Date(Date.now() - 1000)
    await withCommunityRestrictionApplicationClockForTest(
      new Date(expiresAt.getTime() - 1000),
      async () => {
        await expect(
          activateCommunityRestrictions(currentUser, community.id, {
            restrictionTypes: ['no_links'],
            expiresAt,
          }),
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
  it('refuses activation if its expiry passes while waiting for the fence', async () => {
    const { currentUser, community, delegateActorId } = await fixture()
    let expiresAt: Date
    await expect(
      withHeldDelegatedCommunityFenceForTest(
        community.id,
        delegateActorId,
        () => {
          expiresAt = new Date(Date.now() + 10_000)
          return activateCommunityRestrictions(currentUser, community.id, {
            restrictionTypes: ['no_links'],
            expiresAt,
          })
        },
        () => expiresAt,
      ),
    ).rejects.toMatchObject({ status: 422, message: 'expires_at must be in the future' })
    expect(await countTestCommunityRestrictions(community.id)).toBe(0)
    expect(await readStaffActionHistory(currentUser.id)).toEqual([])
  })
  it('does not manually lift a restriction that expires while waiting for the fence', async () => {
    const { currentUser, community, delegateActorId } = await fixture()
    const expiresAt = new Date(Date.now() + 10_000)
    const [restriction] = await activateCommunityRestrictions(currentUser, community.id, {
      restrictionTypes: ['no_links'],
      expiresAt,
    })
    const history = await readStaffActionHistory(currentUser.id)
    await expect(
      withHeldDelegatedCommunityFenceForTest(
        community.id,
        delegateActorId,
        () => liftCommunityRestriction(currentUser, community.id, restriction!.id),
        () => expiresAt,
      ),
    ).rejects.toMatchObject({ status: 404, message: 'No active restriction found' })
    expect((await getTestCommunityRestriction(restriction!.id)).lifted_at).toBeNull()
    expect(await readStaffActionHistory(currentUser.id)).toEqual(history)
  })
  it('refuses activation when community archiving wins the fence', async () => {
    const { currentUser, community } = await fixture()
    await expect(
      withConcurrentCommunityArchiveForTest(
        community.id,
        () =>
          activateCommunityRestrictions(currentUser, community.id, {
            restrictionTypes: ['no_links'],
            expiresAt: null,
          }),
        'lockCommunityRestrictionWrites',
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Community is archived' })
    expect(await countTestCommunityRestrictions(community.id)).toBe(0)
    expect(await readStaffActionHistory(currentUser.id)).toEqual([])
  })
  it.each([
    ['deletion', withConcurrentActorDeletionForTest, 401, 'User not found'],
    ['suspension', withConcurrentActorSuspensionForTest, 403, 'Your account has been suspended'],
  ] as const)(
    'refuses activation when moderator %s wins its lifecycle fence',
    async (_label, race, status, message) => {
      const { currentUser, community } = await fixture()
      await expect(
        race(currentUser.id, () =>
          activateCommunityRestrictions(currentUser, community.id, {
            restrictionTypes: ['no_links'],
            expiresAt: null,
          }),
        ),
      ).rejects.toMatchObject({ status, message })
      expect(await countTestCommunityRestrictions(community.id)).toBe(0)
      expect(await readStaffActionHistory(currentUser.id)).toEqual([])
    },
  )
  it('activation waits until the delegated community fence releases', async () => {
    const { currentUser, community, delegateActorId } = await fixture()
    const restrictions = await withHeldDelegatedCommunityFenceForTest(
      community.id,
      delegateActorId,
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
  it('refuses activation when moderator membership removal wins its row fence', async () => {
    const { currentUser, community } = await fixture()
    await expect(
      withConcurrentCommunityMembershipRemovalForTest(
        community.id,
        currentUser.id,
        () =>
          activateCommunityRestrictions(currentUser, community.id, {
            restrictionTypes: ['no_links'],
            expiresAt: null,
          }),
        'lockCommunityRestrictionWrites.membership',
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
    expect(await countTestCommunityRestrictions(community.id)).toBe(0)
    expect(await readStaffActionHistory(currentUser.id)).toEqual([])
  })
  it('lifting waits until the delegated community fence releases', async () => {
    const { currentUser, community, delegateActorId } = await fixture()
    const [restriction] = await activateCommunityRestrictions(currentUser, community.id, {
      restrictionTypes: ['no_links'],
      expiresAt: null,
    })
    await withHeldDelegatedCommunityFenceForTest(community.id, delegateActorId, () =>
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
