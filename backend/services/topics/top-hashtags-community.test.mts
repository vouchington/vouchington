import { describe, expect, it } from 'vitest'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'
import {
  archiveTestCommunity,
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  insertTestCommunity,
  insertTestCommunityPostReview,
} from '@voucha/test-helpers'
import { createUnlinkedTopicAlias } from './aliases.mts'
import { searchTopHashtags } from './top-hashtags.mts'

describe('searchTopHashtags community eligibility', () => {
  it('includes comments on publicly approved community posts', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `approved-community-comments-${suffix}`
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner!.id,
      visibility: 'public',
    })
    const rootAuthor = await createTestUser()
    const rootPost = await createTestPost({
      user: rootAuthor!,
      title: `Approved community root ${suffix}`,
      community_id: community.id,
      privacy: 'public',
      broadcast: 'everyone',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: rootPost.id,
      submittedById: rootAuthor!.id,
    })
    const alias = await createUnlinkedTopicAlias(hashtag)

    for (let index = 0; index < 3; index++) {
      const commenter = await createTestUser()
      const comment = await createTestPost({
        user: commenter!,
        title: `Approved community comment ${index} ${suffix}`,
        post_type: 'comment',
        parent_id: rootPost.id,
        community_id: community.id,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await createTopHashtagPostSourceForTest({
        postId: comment.id,
        topicAliasId: alias.id,
        userId: commenter!.id,
        authoredToken: `#${hashtag}`,
      })
    }

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([
      expect.objectContaining({
        topic_alias_id: alias.id,
        item_count: 3,
        contributor_count: 3,
      }),
    ])
  })

  it('excludes publicly approved posts from archived communities', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner!.id,
      visibility: 'public',
    })
    const alias = await createUnlinkedTopicAlias(`archived-community-${suffix}`)

    for (let index = 0; index < 3; index++) {
      const contributor = await createTestUser()
      const post = await createTestPost({
        user: contributor!,
        title: `Archived community hashtag source ${index} ${suffix}`,
        community_id: community.id,
        privacy: 'public',
        broadcast: 'everyone',
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: post.id,
        submittedById: contributor!.id,
      })
      await createTopHashtagPostSourceForTest({
        postId: post.id,
        topicAliasId: alias.id,
        userId: contributor!.id,
        authoredToken: `#archived-community-${suffix}`,
      })
    }
    await archiveTestCommunity({ communityId: community.id, archivedById: owner!.id })

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const results = await searchTopHashtags({ q: `archived-community-${suffix}` })

    expect(results.results).toEqual([])
  })
})
