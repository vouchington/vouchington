import { describe, it, expect, beforeAll } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestTopic,
  insertTopicAliasForTest,
} from '@voucha/test-helpers'
import { createCommunityPostFixture } from '../test-support.mts'
import { updatePost } from '../update.mts'
import { archiveCommunity } from '@services/communities/archive'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

// createCommunityPostFixture goes through the real createPost write path, so this suite
// doubles as an integration test of createPost's community authorization/restriction
// enforcement (@services/communities/restrictions, bans, membership, archived-community
// checks). It lives here rather than in @services/communities because posts legitimately
// depends on communities (one-way) to enforce these rules during post creation.
describe('createCommunityPostFixture community authorization', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let community: Community
  let approvalCommunity: Community

  beforeAll(async () => {
    ;[owner, member] = await Promise.all([createTestUser(), createTestUser()])

    ;[community, approvalCommunity] = await Promise.all([
      insertTestCommunity({
        createdById: owner.id,
        post_approval_required_at: null,
      }),
      insertTestCommunity({
        createdById: owner.id,
        post_approval_required_at: new Date(),
      }),
    ])

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
      insertTestCommunityMember({
        communityId: approvalCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: approvalCommunity.id,
        userId: member.id,
        role: 'member',
      }),
    ])
  })

  it('member can create a post in a community without approval', async () => {
    const post = await createCommunityPostFixture(member, community.id)
    expect(post.community_id).toBe(community.id)
  })

  it('can create a post in an approval-required community', async () => {
    const post = await createCommunityPostFixture(member, approvalCommunity.id)
    expect(post.community_id).toBe(approvalCommunity.id)
  })

  it('rejects posting in an archived community', async () => {
    const archivedComm = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: archivedComm.id,
      userId: owner.id,
      role: 'owner',
    })
    await insertTestCommunityMember({
      communityId: archivedComm.id,
      userId: member.id,
      role: 'member',
    })
    await archiveCommunity(archivedComm.id, null)
    await expect(createCommunityPostFixture(member, archivedComm.id)).rejects.toMatchObject({
      status: 403,
    })
  }, 60_000)

  it('non-member cannot post in a community', async () => {
    const stranger = await createTestUser()
    await expect(createCommunityPostFixture(stranger, community.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('rejects a new post whose linked hashtag topic is muted', async () => {
    const suffix = createRandomString(8)
    const hashtag = `pending-muted-${suffix}`
    const topicId = await insertTestTopic({
      name: `Pending muted ${suffix}`,
      slug: `pending-muted-${suffix}`,
      createdById: owner.id,
    })
    await Promise.all([
      insertTopicAliasForTest(topicId, hashtag),
      insertEntityRelation('relation__community__mute__topic', community.id, topicId),
    ])

    await expect(
      createCommunityPostFixture(member, community.id, { markdown: `Visible #${hashtag}` }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects a category edit that adds a muted linked hashtag transactionally', async () => {
    const suffix = createRandomString(8)
    const hashtag = `edit-muted-${suffix}`
    const topicId = await insertTestTopic({
      name: `Edit muted ${suffix}`,
      slug: `edit-muted-${suffix}`,
      createdById: owner.id,
    })
    await Promise.all([
      insertTopicAliasForTest(topicId, hashtag),
      insertEntityRelation('relation__community__mute__topic', community.id, topicId),
    ])
    const post = await createCommunityPostFixture(member, community.id, {
      markdown: `Visible ${suffix}`,
    })

    await expect(updatePost(member, post, { markdown: `Muted #${hashtag}` })).rejects.toMatchObject(
      {
        status: 422,
      },
    )
  })

  it('allows a category edit that removes a muted direct topic', async () => {
    const suffix = createRandomString(8)
    const topicId = await insertTestTopic({
      name: `Removable muted ${suffix}`,
      slug: `removable-muted-${suffix}`,
      createdById: owner.id,
    })
    const post = await createCommunityPostFixture(member, community.id, {
      categories: [{ type: 'topic', topic_id: topicId }],
    })
    await insertEntityRelation('relation__community__mute__topic', community.id, topicId)

    await expect(updatePost(member, post, { categories: [] })).resolves.toBeDefined()
  })
})
