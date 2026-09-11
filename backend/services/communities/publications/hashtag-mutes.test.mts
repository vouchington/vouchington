import { describe, expect, it } from 'vitest'
import {
  createActivePostTopicAliasRelationForTest,
  createRandomString,
  createTestUser,
  createTopHashtagPostSourceForTest,
  getTopicAliasIdForTest,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  insertTestTopic,
  insertTopicAliasForTest,
  setTopHashtagPostRelationScoreForTest,
} from '@voucha/test-helpers'
import { createCommunityPostReview } from './add.mts'
import { searchCommunityPosts } from './get.mts'

describe('community hashtag-topic mutes', () => {
  it('rejects a post whose linked hashtag topic is muted in its community', async () => {
    const { community, owner, postId } = await createCommunityPostWithMutedHashtag()

    await expect(createCommunityPostReview(owner.id, postId, community.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('hides an approved post whose linked hashtag topic is muted in its community', async () => {
    const { community, owner, postId } = await createCommunityPostWithMutedHashtag()
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })

    const result = await searchCommunityPosts(community.id)

    expect(result.results.map(post => post.id)).not.toContain(postId)
  })

  it('does not apply a mute after the hashtag category relation loses support', async () => {
    const { aliasId, community, owner, postId } = await createCommunityPostWithMutedHashtag()
    await setTopHashtagPostRelationScoreForTest({ postId, topicAliasId: aliasId, score: 0 })

    await expect(createCommunityPostReview(owner.id, postId, community.id)).resolves.toBeDefined()

    const result = await searchCommunityPosts(community.id)
    expect(result.results.map(post => post.id)).toContain(postId)
  })

  it('hides an approved post with a positive alias relation to a muted topic but no source row', async () => {
    const { community, owner, postId } = await createCommunityPostWithMutedHashtagNoSource()
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })

    const result = await searchCommunityPosts(community.id)

    expect(result.results.map(post => post.id)).not.toContain(postId)
  })

  async function createCommunityPostWithMutedHashtagNoSource() {
    const suffix = createRandomString(8)
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const topicId = await insertTestTopic({
      name: `Muted hashtag topic no source ${suffix}`,
      slug: `muted-hashtag-topic-no-source-${suffix}`,
      createdById: owner.id,
    })
    const hashtag = `muted-hashtag-no-source-${suffix}`
    await insertTopicAliasForTest(topicId, hashtag)
    const aliasId = await getTopicAliasIdForTest(hashtag)
    expect(aliasId).not.toBeNull()
    const postId = await insertTestPost({
      title: `Muted hashtag post no source ${suffix}`,
      slug: `muted-hashtag-post-no-source-${suffix}`,
      markdown: 'No hashtag mentioned here.',
      createdById: owner.id,
      communityId: community.id,
    })
    await Promise.all([
      createActivePostTopicAliasRelationForTest({
        postId,
        topicAliasId: aliasId!,
        userId: owner.id,
      }),
      insertEntityRelation('relation__community__mute__topic', community.id, topicId),
    ])
    return { aliasId: aliasId!, community, owner, postId }
  }

  async function createCommunityPostWithMutedHashtag() {
    const suffix = createRandomString(8)
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const topicId = await insertTestTopic({
      name: `Muted hashtag topic ${suffix}`,
      slug: `muted-hashtag-topic-${suffix}`,
      createdById: owner.id,
    })
    const hashtag = `muted-hashtag-${suffix}`
    await insertTopicAliasForTest(topicId, hashtag)
    const aliasId = await getTopicAliasIdForTest(hashtag)
    expect(aliasId).not.toBeNull()
    const postId = await insertTestPost({
      title: `Muted hashtag post ${suffix}`,
      slug: `muted-hashtag-post-${suffix}`,
      markdown: `#${hashtag}`,
      createdById: owner.id,
      communityId: community.id,
    })
    await Promise.all([
      createTopHashtagPostSourceForTest({
        postId,
        topicAliasId: aliasId!,
        userId: owner.id,
        authoredToken: `#${hashtag}`,
      }),
      insertEntityRelation('relation__community__mute__topic', community.id, topicId),
    ])
    return { aliasId: aliasId!, community, owner, postId }
  }
})
