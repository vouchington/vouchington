import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  createTestUrlWithHostname,
  insertTestImage,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityRestriction,
} from '@voucha/test-helpers'
import { createCommunityPostFixture } from '../test-support.mts'
import { createPost } from '../create.mts'
import { updatePost } from '../update.mts'
import { setPostImages } from '../images.mts'
import { upsertEntityRelation } from '@services/entity-relations'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
// Side-effect imports: register the entity-relations guards consulted by the direct
// upsertEntityRelation call below (referral-link + post-related-urls).
import '@services/referral-program-link-validations'
import '../register-post-related-urls-guard.mts'
import { assertCommunityNoLinksAllowed } from '@services/communities/restrictions/enforce'
import { joinCommunity } from '@services/communities/members/join'
import { searchPendingPosts } from '@services/communities/publications/get'

// createCommunityPostFixture/createPost/updatePost/setPostImages exercise the real posts
// write path, which calls into @services/communities/restrictions during creation/updates.
// This suite lives under posts (which legitimately depends on communities) rather than
// communities, since communities must not depend on posts.
describe('community restriction enforcement', () => {
  it('requires moderator approval for root community posts while active', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityMember({ communityId: community.id, userId: member!.id })
    await insertTestCommunityRestriction({
      communityId: community.id,
      restrictionType: 'require_post_approval',
      activatedById: owner!.id,
      expiresAt: futureDate(),
    })

    const post = await createCommunityPostFixture(member!, community.id)
    const pending = await searchPendingPosts(community.id)
    expect(pending.results.map(result => result.id)).toContain(post.id)
  })

  it('blocks members who joined after no_new_member_posts activated', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityRestriction({
      communityId: community.id,
      restrictionType: 'no_new_member_posts',
      activatedById: owner!.id,
      activatedAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: futureDate(),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    })

    await expect(createCommunityPostFixture(member!, community.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('blocks links in community comments while no_links is active', async () => {
    const { community, member } = await insertCommunityWithNoLinksAndMember()
    const post = await createCommunityPostFixture(member, community.id)
    await expect(
      createPost(member, {
        post_type: 'comment',
        parent_id: post.id,
        markdown: 'see https://example.com',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('blocks links in image captions while no_links is active', async () => {
    const { community, member } = await insertCommunityWithNoLinksAndMember()
    const imageId = await insertTestImage(member.id)
    await expect(
      createPost(member, {
        post_type: 'discussion',
        community_id: community.id,
        title: 'caption link',
        images: [{ image_id: imageId, order_index: 0, caption: 'see www.example.com' }],
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('blocks links added by editing community post content while no_links is active', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityMember({ communityId: community.id, userId: member!.id })
    const post = await createCommunityPostFixture(member!, community.id, {
      markdown: 'plain text before raid mode',
    })
    await insertTestCommunityRestriction({
      communityId: community.id,
      restrictionType: 'no_links',
      activatedById: owner!.id,
      expiresAt: futureDate(),
    })

    await expect(
      updatePost(member!, post, { markdown: 'see https://example.com' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('blocks links added by updating image captions while no_links is active', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityMember({ communityId: community.id, userId: member!.id })
    const post = await createCommunityPostFixture(member!, community.id)
    const imageId = await insertTestImage(member!.id)
    await insertTestCommunityRestriction({
      communityId: community.id,
      restrictionType: 'no_links',
      activatedById: owner!.id,
      expiresAt: futureDate(),
    })

    await expect(
      setPostImages(member!, post, [
        { image_id: imageId, order_index: 0, caption: 'see www.example.com' },
      ]),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('blocks related URL attachments while no_links is active', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityMember({ communityId: community.id, userId: member!.id })
    const post = await createCommunityPostFixture(member!, community.id)
    const urlId = await createTestUrlWithHostname()
    const metadata = entityRelationMetadatum.find(
      item =>
        item.subject_type === 'post' && item.predicate === 'related' && item.object_type === 'url',
    )!
    await insertTestCommunityRestriction({
      communityId: community.id,
      restrictionType: 'no_links',
      activatedById: owner!.id,
      expiresAt: futureDate(),
    })

    await expect(
      upsertEntityRelation(member!, metadata, post, [{ id: urlId }]),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('blocks public self-join while approved_members_only is active', async () => {
    const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityRestriction({
      communityId: community.id,
      restrictionType: 'approved_members_only',
      activatedById: owner!.id,
      expiresAt: futureDate(),
    })

    await expect(joinCommunity(user!.id, community.id)).rejects.toMatchObject({ status: 403 })
  })

  it('allows approved members to post under approved_members_only', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      approvedById: owner!.id,
    })
    await insertTestCommunityRestriction({
      communityId: community.id,
      restrictionType: 'approved_members_only',
      activatedById: owner!.id,
      expiresAt: futureDate(),
    })

    await expect(createCommunityPostFixture(member!, community.id)).resolves.toMatchObject({
      community_id: community.id,
    })
  })
  it('blocks bare-domain links in markdown while no_links is active', async () => {
    const { community, member } = await insertCommunityWithNoLinksAndMember()
    const post = await createCommunityPostFixture(member, community.id)
    await expect(
      createPost(member, {
        post_type: 'comment',
        parent_id: post.id,
        markdown: 'join discord.gg/raid please',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('blocks bare-domain links in title while no_links is active', async () => {
    const { community, member } = await insertCommunityWithNoLinksAndMember()
    await expect(
      createPost(member, {
        post_type: 'discussion',
        community_id: community.id,
        title: 'visit t.me/abc for the raid',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('blocks bare-domain links in image captions while no_links is active', async () => {
    const { community, member } = await insertCommunityWithNoLinksAndMember()
    const imageId = await insertTestImage(member.id)
    await expect(
      createPost(member, {
        post_type: 'discussion',
        community_id: community.id,
        title: 'raid announcement',
        images: [{ image_id: imageId, order_index: 0, caption: 'see example.com/path for info' }],
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('allows ordinary prose without links while no_links is active', async () => {
    const { community, member } = await insertCommunityWithNoLinksAndMember()
    const post = await createCommunityPostFixture(member, community.id)
    await expect(
      createPost(member, {
        post_type: 'comment',
        parent_id: post.id,
        markdown: 'see e.g. the docs and use version v1.0 today',
      }),
    ).resolves.toMatchObject({ post_type: 'comment' })
  })
  it('blocks bare-domain links in structured_data while no_links is active', async () => {
    const { community, member } = await insertCommunityWithNoLinksAndMember()
    // Call assertCommunityNoLinksAllowed directly: createPost validates post_type
    // before the restriction check, so passing structured_data through createPost
    // would be rejected as 422 before reaching the 403 guard.
    await expect(
      assertCommunityNoLinksAllowed({
        communityId: community.id,
        currentUser: member,
        updates: { structured_data: [{ message: 'discord.gg/raid' }] },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('lets community moderators bypass block restrictions', async () => {
    const [owner, moderator] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertCommunityWithOwner(owner!.id)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator!.id,
      role: 'moderator',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    })
    await Promise.all([
      insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_new_member_posts',
        activatedById: owner!.id,
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        expiresAt: futureDate(),
      }),
      insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_links',
        activatedById: owner!.id,
        expiresAt: futureDate(),
      }),
    ])

    await expect(
      createCommunityPostFixture(moderator!, community.id, {
        markdown: 'see https://example.com',
      }),
    ).resolves.toMatchObject({ community_id: community.id })
  })
})
async function insertCommunityWithNoLinksAndMember() {
  const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
  const community = await insertCommunityWithOwner(owner!.id)
  await insertTestCommunityMember({ communityId: community.id, userId: member!.id })
  await insertTestCommunityRestriction({
    communityId: community.id,
    restrictionType: 'no_links',
    activatedById: owner!.id,
    expiresAt: futureDate(),
  })
  return { community, member: member! }
}
async function insertCommunityWithOwner(ownerId: string) {
  const community = await insertTestCommunity({
    createdById: ownerId,
    slug: `raid-mode-${createRandomString(8)}`,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

function futureDate(): Date {
  return new Date(Date.now() + 60 * 60 * 1000)
}
