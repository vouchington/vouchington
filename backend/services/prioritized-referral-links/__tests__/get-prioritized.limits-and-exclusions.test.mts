import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertTestLocalFollow,
  insertTestMute,
  insertTestBlock,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'
import {
  createTestMembership,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers/entities/memberships'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'

let admin: PrivateUser

let referralProgramId: string

let testHostname: string

async function createUserWithLink(
  labelPrefix: string,
): Promise<{ user: PrivateUser; linkId: string }> {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')
  const suffix = createRandomString(8)
  const link = await createUserReferralLink(user, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${labelPrefix}-${suffix}`,
    label: `${labelPrefix} link`,
  })
  return { user, linkId: link.id }
}

describe('get-prioritized prioritized referral limits and exclusions', () => {
  beforeAll(async () => {
    const testUser = await createTestUser({ administrator: true })
    if (!testUser) throw new Error('Failed to create test admin user')
    admin = testUser
    const suffix = createRandomString(8)
    testHostname = `prioritized-test-${suffix}.example.com`

    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  }, 30_000)

  it('always returns all group 1+2 (friends) regardless of limit', async () => {
    const viewer = await createTestUser()

    // Create 4 mutual follows + 4 one-way follows = 8 friends (> default limit of 5)
    const mutuals = await Promise.all(
      Array.from({ length: 4 }, () => createUserWithLink('limit-mutual')),
    )
    const follows = await Promise.all(
      Array.from({ length: 4 }, () => createUserWithLink('limit-follow')),
    )

    await Promise.all(
      mutuals.map(async ({ user }) => {
        await insertTestLocalFollow(viewer.id, user.id)
        await insertTestLocalFollow(user.id, viewer.id)
      }),
    )
    await Promise.all(follows.map(({ user }) => insertTestLocalFollow(viewer.id, user.id)))

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    const friends = result.links.filter(l => l.priority_group <= 2)
    const mutualIds = mutuals.map(m => m.user.id)
    const followIds = follows.map(f => f.user.id)

    for (const id of mutualIds) {
      expect(friends.some(l => l.user_id === id)).toBe(true)
    }
    for (const id of followIds) {
      expect(friends.some(l => l.user_id === id)).toBe(true)
    }

    // Groups 3-5 should not be included (friends >= limit of 5)
    const nonFriends = result.links.filter(l => l.priority_group > 2)
    expect(nonFriends).toHaveLength(0)
  }, 30_000)

  it('fills remaining slots from groups 3-5 up to limit when friends < limit', async () => {
    const [viewer, { user: friend }] = await Promise.all([
      createTestUser(),
      createUserWithLink('limit-friend'),
    ])

    await Promise.all([
      insertTestLocalFollow(viewer!.id, friend.id),
      insertTestLocalFollow(friend.id, viewer!.id),
    ])

    // Create some strangers to fill group 5
    await Promise.all(Array.from({ length: 10 }, () => createUserWithLink('limit-stranger')))

    // Default limit is 5: 1 friend + 4 others
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId)

    expect(result.links.length).toBeLessThanOrEqual(5)
    const friendLinks = result.links.filter(l => l.priority_group <= 2)
    expect(friendLinks.some(l => l.user_id === friend.id)).toBe(true)
  }, 30_000)

  it('anonymous user gets all group 5, limited to 5', async () => {
    // Ensure at least one link exists for this program
    await createUserWithLink('anon')

    const result = await getPrioritizedReferralLinks(null, referralProgramId)

    expect(result.links.length).toBeGreaterThan(0)
    expect(result.links.length).toBeLessThanOrEqual(5)
    const allGroup5 = result.links.every(l => l.priority_group === 5)
    expect(allGroup5).toBe(true)
  }, 30_000)

  it('excludes muted and blocked users', async () => {
    const [viewer, { user: mutedUser }, { user: blockedUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('muted'),
      createUserWithLink('blocked'),
    ])

    await Promise.all([
      insertTestMute(viewer!.id, mutedUser.id),
      insertTestBlock(viewer!.id, blockedUser.id),
    ])

    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    expect(result.links.some(l => l.user_id === mutedUser.id)).toBe(false)
    expect(result.links.some(l => l.user_id === blockedUser.id)).toBe(false)
  }, 30_000)

  it('excludes the current user from results', async () => {
    const viewer = await createTestUser()
    const suffix = createRandomString(8)
    await createUserReferralLink(viewer, {
      user_id: viewer.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/self-${suffix}`,
      label: 'Self link',
    })

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 100 })

    expect(result.links.some(l => l.user_id === viewer.id)).toBe(false)
  })

  it('all=true returns the complete all-links view with no social priority and includes current user', async () => {
    const viewer = await createTestUser()
    const suffix = createRandomString(8)
    // Create viewer's own link
    await createUserReferralLink(viewer, {
      user_id: viewer.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/all-self-${suffix}`,
      label: 'Own link',
    })
    // Create another user's link
    const { user: other } = await createUserWithLink('all-other')

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { all: true })

    // All links should have priority_group = 5
    expect(result.links.every(l => l.priority_group === 5)).toBe(true)
    // Should include viewer's own link
    expect(result.links.some(l => l.user_id === viewer.id)).toBe(true)
    // Should include other user's link
    expect(result.links.some(l => l.user_id === other.id)).toBe(true)
    expect(result.links.length).toBeGreaterThan(0)
  }, 30_000)

  it('populates users map with user details', async () => {
    const [viewer, { user: linkUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('user-details'),
    ])

    // Use a high limit to ensure user appears regardless of other test data in the DB
    const result = await getPrioritizedReferralLinks(viewer!.id, referralProgramId, {
      limit: 100,
    })

    const foundLink = result.links.find(l => l.user_id === linkUser.id)
    expect(foundLink).toBeDefined()

    const user = result.users[linkUser.id]
    expect(user).toBeDefined()
    expect(user.id).toBe(linkUser.id)
    expect(user.username).toBeTruthy()
  })

  it("hides a child referral link once the owner's membership expires_at lapses, while an unrelated link stays visible", async () => {
    // Control: an ordinary top-level link, unrelated to any membership state, must stay
    // visible in both checks below.
    const { linkId: controlLinkId } = await createUserWithLink('membership-control')

    const childOwner = await createTestUser()
    const membership = await createTestMembership({ user_id: childOwner.id, plan: 'plus' })

    // The FK-referenced parent lives under a different referral program so it never enters
    // this program's active_links CTE; only its id is needed to satisfy parent_link_id.
    const otherProgramId = await insertTestReferralProgram({ createdById: admin.id })
    const parentUrlId = await createTestUrlWithHostname()
    const parentId = await insertTestUserReferralProgramLink({
      userId: childOwner.id,
      referralProgramId: otherProgramId,
      urlId: parentUrlId,
    })

    const childUrlId = await createTestUrlWithHostname()
    const childId = await insertTestUserReferralProgramLink({
      userId: childOwner.id,
      referralProgramId,
      urlId: childUrlId,
      parentLinkId: parentId,
    })

    // Before: childOwner's plus membership is active and not expired -> the child is visible.
    const before = await getPrioritizedReferralLinks(null, referralProgramId, { all: true })
    expect(before.links.some(l => l.id === childId)).toBe(true)
    expect(before.links.some(l => l.id === controlLinkId)).toBe(true)

    // Simulate a granted/comp membership lapsing purely by time: only expires_at moves,
    // cancelled_at/expired_at/paused_at stay NULL (no Stripe event fires for this case).
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 24 * 60 * 60 * 1000))

    // After: the same child must now be hidden; the unrelated control link is unaffected.
    const after = await getPrioritizedReferralLinks(null, referralProgramId, { all: true })
    expect(after.links.some(l => l.id === childId)).toBe(false)
    expect(after.links.some(l => l.id === controlLinkId)).toBe(true)
  })

  it("keeps a child referral link visible when its owner's Stripe period end elapses", async () => {
    const childOwner = await createTestUser()
    const membership = await createTestMembership({
      user_id: childOwner.id,
      plan: 'plus',
      stripe_subscription_id: `sub_child_visibility_${createRandomString(8)}`,
    })
    const otherProgramId = await insertTestReferralProgram({ createdById: admin.id })
    const parentId = await insertTestUserReferralProgramLink({
      userId: childOwner.id,
      referralProgramId: otherProgramId,
      urlId: await createTestUrlWithHostname(),
    })
    const childId = await insertTestUserReferralProgramLink({
      userId: childOwner.id,
      referralProgramId,
      urlId: await createTestUrlWithHostname(),
      parentLinkId: parentId,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 24 * 60 * 60 * 1000))

    const result = await getPrioritizedReferralLinks(null, referralProgramId, { all: true })

    expect(result.links.some(link => link.id === childId)).toBe(true)
  })
})
