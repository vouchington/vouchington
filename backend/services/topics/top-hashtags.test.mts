import { describe, expect, it } from 'vitest'
import { createPost } from '../posts/create.mts'
import { getPostByAny } from '../posts/get.mts'
import { getPostIds } from '../posts/search/get-ids.mts'
import { createRandomString } from '@voucha/test-helpers/data'
import { archiveTestCommunity } from '@voucha/test-helpers/entities/community-archive'
import { insertTestCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import { WEB_PROVENANCE } from '@voucha/test-helpers/entities/content-provenance'
import { CONTRIBUTING_USER_AGE_MS } from '@voucha/test-helpers/entities/contribution-gating'
import { createTestPost, createTestTopic } from '@voucha/test-helpers/entities/create-test-entities'
import { getEntityRelation } from '@voucha/test-helpers/entities/entity-relations'
import {
  approveTestPost,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers/entities/post-clearance'
import { createTopHashtagPostSourceForTest } from '@voucha/test-helpers/entities/top-hashtags'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createTestUserWithAge } from '@voucha/test-helpers/entities/users-direct'
import { suspendTestUser } from '@voucha/test-helpers/entities/users-lifecycle'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view-for-test'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { createUnlinkedTopicAlias, linkTopicAlias } from './aliases.mts'
import { searchTopHashtags } from './top-hashtags.mts'

type RootRestriction = 'private' | 'rejected' | 'suspended-author'

async function addHashtagComment(options: {
  alias: { id: string }
  hashtag: string
  rootPostId: string
  title: string
  communityId?: string
}): Promise<void> {
  const commenter = await createTestUser()
  const comment = await createTestPost({
    user: commenter!,
    title: options.title,
    post_type: 'comment',
    parent_post_id: options.rootPostId,
    ...(options.communityId
      ? { community_id: options.communityId, privacy: 'public', broadcast: 'everyone' }
      : {}),
  })
  await createTopHashtagPostSourceForTest({
    postId: comment.id,
    topicAliasId: options.alias.id,
    userId: commenter!.id,
    authoredToken: `#${options.hashtag}`,
  })
}

describe('searchTopHashtags native view', () => {
  it.each<RootRestriction>(['private', 'rejected', 'suspended-author'])(
    'excludes hashtags from comments under a %s root post',
    async restriction => {
      const suffix = crypto.randomUUID()
      const hashtag = `${restriction}-root-comment-${suffix}`
      const [alias, rootAuthor] = await Promise.all([
        createUnlinkedTopicAlias(hashtag),
        createTestUser(),
      ])
      const rootPost = await createTestPost({
        user: rootAuthor!,
        title: `${restriction} root post ${suffix}`,
        privacy: restriction === 'private' ? 'private' : 'public',
        broadcast: restriction === 'private' ? 'followers' : 'everyone',
      })
      await Promise.all(
        [0, 1, 2].map(index =>
          addHashtagComment({
            alias,
            hashtag,
            rootPostId: rootPost.id,
            title: `${restriction} root hashtag comment ${index} ${suffix}`,
          }),
        ),
      )
      if (restriction === 'rejected') {
        await setTestPostClearanceStatus(rootPost.id, 'rejected', rootAuthor!.id)
      } else if (restriction === 'suspended-author') {
        await suspendTestUser(rootAuthor!.id)
      }
      await refreshMaterializedViewForTest('mv_top_hashtags')

      expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
    },
  )

  it('counts comments under an approved community root post', async () => {
    const suffix = crypto.randomUUID()
    const hashtag = `approved-community-comments-${suffix}`
    const [owner, rootAuthor] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
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
    await Promise.all(
      [0, 1, 2].map(index =>
        addHashtagComment({
          alias,
          hashtag,
          rootPostId: rootPost.id,
          title: `Approved community comment ${index} ${suffix}`,
          communityId: community.id,
        }),
      ),
    )
    await refreshMaterializedViewForTest('mv_top_hashtags')

    const approved = (await searchTopHashtags({ q: hashtag })).results
    expect(approved).toHaveLength(1)
    expect(approved[0]?.topic_alias_id).toBe(alias.id)
    expect(approved[0]?.item_count).toBe(3)
    expect(approved[0]?.contributor_count).toBe(3)
  })

  it('excludes hashtags from posts in an archived community', async () => {
    const suffix = crypto.randomUUID()
    const hashtag = `archived-community-${suffix}`
    const [owner, alias] = await Promise.all([createTestUser(), createUnlinkedTopicAlias(hashtag)])
    const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
    await Promise.all(
      [0, 1, 2].map(async index => {
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
          authoredToken: `#${hashtag}`,
        })
      }),
    )
    await archiveTestCommunity({ communityId: community.id, archivedById: owner!.id })
    await refreshMaterializedViewForTest('mv_top_hashtags')

    expect((await searchTopHashtags({ q: hashtag })).results).toEqual([])
  })

  it('drops a deleted author from the view while the post keeps its token', async () => {
    const hashtag = `retained-${createRandomString(8).toLowerCase()}`
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const contributors = await Promise.all([
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
    ])
    const [viewer, alias] = await Promise.all([createTestUser(), createUnlinkedTopicAlias(hashtag)])
    const topic = await createTestTopic({ user: viewer })
    const sourcePost = await createPost(author, WEB_PROVENANCE, {
      post_type: 'discussion',
      title: `Retained source #${hashtag}`,
    })
    const supportingPosts = await Promise.all(
      contributors.map((contributor, index) =>
        createPost(contributor!, WEB_PROVENANCE, {
          post_type: 'discussion',
          title: `Supporting source ${index} #${hashtag}`,
        }),
      ),
    )
    await Promise.all([sourcePost, ...supportingPosts].map(post => approveTestPost(post!.id)))
    await linkTopicAlias(topic.id, alias.id)
    await deleteUserAndDrainForTest(author, author)

    const relation = (
      await getEntityRelation('relation__post__category__topic_alias', sourcePost!.id, alias.id)
    )[0]
    expect(relation).toMatchObject({ votes_score_net: 0 })
    const retained = (await getPostByAny(sourcePost!.id))?.post_hashtags
    expect(retained?.some(row => row.key === hashtag)).toBe(true)
    const search = await getPostIds(viewer, { hashtag_topic_ids: [topic.id], limit: 100 })
    expect(search.results.some(row => row.id === sourcePost!.id)).toBe(false)

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const { results } = await searchTopHashtags({ q: hashtag })
    expect(results.some(row => row.topic_alias_id === alias.id)).toBe(false)
  })
})
