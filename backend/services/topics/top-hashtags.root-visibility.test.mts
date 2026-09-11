import { describe, expect, it } from 'vitest'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'
import {
  createTestPost,
  createTestUser,
  createTopHashtagPostSourceForTest,
  setTestPostClearanceStatus,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createUnlinkedTopicAlias } from './aliases.mts'
import { searchTopHashtags } from './top-hashtags.mts'

describe('searchTopHashtags root visibility', () => {
  it('excludes hashtags on comments whose root post is not publicly visible', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `private-root-comment-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const rootAuthor = await createTestUser()
    const rootPost = await createTestPost({
      user: rootAuthor!,
      title: `Private root post ${suffix}`,
      privacy: 'private',
      broadcast: 'followers',
    })

    for (let index = 0; index < 3; index++) {
      const commenter = await createTestUser()
      const comment = await createTestPost({
        user: commenter!,
        title: `Private-root hashtag comment ${index} ${suffix}`,
        post_type: 'comment',
        parent_id: rootPost.id,
      })
      await createTopHashtagPostSourceForTest({
        postId: comment.id,
        topicAliasId: alias.id,
        userId: commenter!.id,
        authoredToken: `#${hashtag}`,
      })
    }

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })

  it('excludes hashtags on approved comments after their root loses clearance', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `rejected-root-comment-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const rootAuthor = await createTestUser()
    const rootPost = await createTestPost({
      user: rootAuthor!,
      title: `Rejected root post ${suffix}`,
      privacy: 'public',
      broadcast: 'everyone',
    })

    for (let index = 0; index < 3; index++) {
      const commenter = await createTestUser()
      const comment = await createTestPost({
        user: commenter!,
        title: `Rejected-root hashtag comment ${index} ${suffix}`,
        post_type: 'comment',
        parent_id: rootPost.id,
      })
      await createTopHashtagPostSourceForTest({
        postId: comment.id,
        topicAliasId: alias.id,
        userId: commenter!.id,
        authoredToken: `#${hashtag}`,
      })
    }
    await setTestPostClearanceStatus(rootPost.id, 'rejected', rootAuthor!.id)

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })

  it('excludes hashtags on comments after their root author is suspended', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const hashtag = `suspended-root-comment-${suffix}`
    const alias = await createUnlinkedTopicAlias(hashtag)
    const rootAuthor = await createTestUser()
    const rootPost = await createTestPost({
      user: rootAuthor!,
      title: `Suspended root author ${suffix}`,
      privacy: 'public',
      broadcast: 'everyone',
    })

    for (let index = 0; index < 3; index++) {
      const commenter = await createTestUser()
      const comment = await createTestPost({
        user: commenter!,
        title: `Suspended-root hashtag comment ${index} ${suffix}`,
        post_type: 'comment',
        parent_id: rootPost.id,
      })
      await createTopHashtagPostSourceForTest({
        postId: comment.id,
        topicAliasId: alias.id,
        userId: commenter!.id,
        authoredToken: `#${hashtag}`,
      })
    }
    await suspendTestUser(rootAuthor!.id)

    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })
})
