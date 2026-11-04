import { beforeEach, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertPostElectionVote,
  insertSessionReferralAttribution,
  insertTestLocalFollow,
  insertTestPost,
  archivePostForTopHashtagTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
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
  const link = await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${labelPrefix}-${suffix}`,
    label: `${labelPrefix} link`,
  })
  return { user, linkId: link.id }
}

describe('get-prioritized in-network priority groups', () => {
  // Each test gets its own program so the shared out-of-network list holds only its own links.
  beforeEach(async () => {
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
  })

  it('returns empty arrays when no links exist', async () => {
    const viewer = await createTestUser()
    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links).toHaveLength(0)
    expect(Object.keys(result.users)).toHaveLength(0)
  })

  it('assigns the four network tiers and leaves strangers out', async () => {
    const [
      viewer,
      { user: mutualFriend },
      { user: followed },
      { user: referrer },
      { user: upvotedAuthor },
      { user: stranger },
    ] = await Promise.all([
      createTestUser(),
      createUserWithLink('pg-mutual'),
      createUserWithLink('pg-followed'),
      createUserWithLink('pg-referrer'),
      createUserWithLink('pg-author'),
      createUserWithLink('pg-stranger'),
    ])

    const suffix = createRandomString(8)

    await Promise.all([
      insertTestLocalFollow(viewer.id, mutualFriend.id),
      insertTestLocalFollow(mutualFriend.id, viewer.id),
      insertTestLocalFollow(viewer.id, followed.id),
      insertSessionReferralAttribution(
        crypto.randomUUID(),
        referrer.id,
        'https://example.com/',
        viewer.id,
      ),
      insertTestPost({
        title: `Test Post ${suffix}`,
        slug: `test-post-${suffix}`,
        createdById: upvotedAuthor.id,
        markdown: 'content',
      }).then(postId => insertPostElectionVote(viewer.id, postId, 1)),
    ])

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    const byUser = Object.fromEntries(result.links.map(l => [l.user_id, l.priority_group]))
    expect(byUser[mutualFriend.id]).toBe(1)
    expect(byUser[followed.id]).toBe(2)
    expect(byUser[referrer.id]).toBe(3)
    expect(byUser[upvotedAuthor.id]).toBe(4)
    expect(byUser[stranger.id]).toBeUndefined()
    expect(result.links.map(l => l.priority_group)).toEqual([1, 2, 3, 4])
  })

  it('lists a user who qualifies for several tiers once, in the highest', async () => {
    const [viewer, { user: multiUser }] = await Promise.all([
      createTestUser(),
      createUserWithLink('dedup'),
    ])

    await Promise.all([
      insertTestLocalFollow(viewer.id, multiUser.id),
      insertTestLocalFollow(multiUser.id, viewer.id),
      insertSessionReferralAttribution(
        crypto.randomUUID(),
        multiUser.id,
        'https://example.com/',
        viewer.id,
      ),
    ])

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    const userLinks = result.links.filter(l => l.user_id === multiUser.id)
    expect(userLinks).toHaveLength(1)
    expect(userLinks[0].priority_group).toBe(1)
  })

  it('caps the network at five links, best tier first', async () => {
    const viewer = await createTestUser()
    const mutuals = await Promise.all(
      Array.from({ length: 3 }, () => createUserWithLink('cap-mutual')),
    )
    const follows = await Promise.all(
      Array.from({ length: 4 }, () => createUserWithLink('cap-follow')),
    )
    await Promise.all(
      mutuals.map(async ({ user }) => {
        await insertTestLocalFollow(viewer.id, user.id)
        await insertTestLocalFollow(user.id, viewer.id)
      }),
    )
    await Promise.all(follows.map(({ user }) => insertTestLocalFollow(viewer.id, user.id)))

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.map(l => l.priority_group)).toEqual([1, 1, 1, 2, 2])
    const mutualIds = new Set(mutuals.map(m => m.user.id))
    expect(result.links.slice(0, 3).every(l => mutualIds.has(l.user_id!))).toBe(true)
  })

  it('replaces the shared list with the network when the viewer has one', async () => {
    const [viewer, { user: friend }] = await Promise.all([
      createTestUser(),
      createUserWithLink('replace-friend'),
    ])
    await insertTestLocalFollow(viewer.id, friend.id)
    await Promise.all(Array.from({ length: 6 }, () => createUserWithLink('replace-stranger')))

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.map(l => l.user_id)).toEqual([friend.id])
  })

  it('does not prioritize an author from an upvote on an ineligible post', async () => {
    const [viewer, { user: author }] = await Promise.all([
      createTestUser(),
      createUserWithLink('ineligible-upvote'),
    ])
    const postId = await insertTestPost({
      title: `Archived upvote ${createRandomString(8)}`,
      slug: `archived-upvote-${createRandomString(8)}`,
      createdById: author.id,
      markdown: 'content',
    })
    await insertPostElectionVote(viewer.id, postId, 1)
    await archivePostForTopHashtagTest(postId, author.id)

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    expect(result.links.find(link => link.user_id === author.id)?.priority_group).toBe(6)
  })
})
