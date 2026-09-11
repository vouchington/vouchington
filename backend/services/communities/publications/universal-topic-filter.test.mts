import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { searchCommunityPosts } from './get.mts'

describe('community publication universal-topic filtering', () => {
  it('finds an approved hashtag-only post by universal topic', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic({ user: owner })
    const postId = await insertTestPost({
      title: `Community hashtag post ${community.id}`,
      slug: `community-hashtag-post-${community.id}`,
      markdown: 'Community hashtag post',
      createdById: owner.id,
      communityId: community.id,
    })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `community-tag-${postId}`)

    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner.id,
      }),
      createTopHashtagPostSourceForTest({
        postId,
        topicAliasId: aliasId,
        userId: owner.id,
        authoredToken: `#community-tag-${postId}`,
      }),
    ])

    const result = await searchCommunityPosts(community.id, {
      universal_topic_ids: [topic.id],
    })

    expect(result.results.map(row => row.id)).toContain(postId)
  })
})
