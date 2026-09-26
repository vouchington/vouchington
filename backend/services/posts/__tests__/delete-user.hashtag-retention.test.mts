import { describe, expect, it } from 'vitest'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view'
import {
  approveTestPost,
  CONTRIBUTING_USER_AGE_MS,
  createRandomString,
  createTestUser,
  createTestUserWithAge,
  createTestTopic,
  getEntityRelation,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createUnlinkedTopicAlias, linkTopicAlias, searchTopHashtags } from '@services/topics'
import { deleteUserAndDrainForTest } from '@services/users/delete-test-support'
import { createPost } from '../create.mts'
import { getPostByAny } from '../get.mts'
import { getPostIds } from '../search/get-ids.mts'
import { updatePost } from '../update.mts'

describe('deleteUser hashtag retention', () => {
  it('retains authored hashtags after removing the author’s supporting relation vote', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const hashtag = `retained-${suffix}`
    const author = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const contributors = await Promise.all([
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
    ])
    const viewer = await createTestUser()
    const topic = await createTestTopic({ user: viewer })
    const alias = await createUnlinkedTopicAlias(hashtag)
    const sourcePost = await createPost(WEB_PROVENANCE, author, {
      post_type: 'discussion',
      title: `Retained source #${hashtag}`,
    })
    const supportingPosts = await Promise.all(
      contributors.map((contributor, index) =>
        createPost(WEB_PROVENANCE, contributor!, {
          post_type: 'discussion',
          title: `Supporting source ${index} #${hashtag}`,
        }),
      ),
    )
    await Promise.all([sourcePost, ...supportingPosts].map(post => approveTestPost(post!.id)))
    await linkTopicAlias(topic.id, alias.id)

    await deleteUserAndDrainForTest(author, author)

    const relations = await getEntityRelation(
      'relation__post__category__topic_alias',
      sourcePost!.id,
      alias.id,
    )
    expect(relations[0]).toMatchObject({ votes_score_net: 0 })
    expect((await getPostByAny(sourcePost!.id))?.post_hashtags).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: hashtag })]),
    )
    expect(
      (await getPostIds(viewer, { hashtag_topic_ids: [topic.id], limit: 100 })).results,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: sourcePost!.id })]))

    await refreshMaterializedViewForTest('mv_top_hashtags')
    const { results } = await searchTopHashtags({ q: hashtag })
    expect(results).not.toContainEqual(expect.objectContaining({ topic_alias_id: alias.id }))
  })

  it('retains a hashtag vote from an editor who moved it to a new source', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const hashtag = `moved-${suffix}`
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const editor = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const post = await createPost(WEB_PROVENANCE, owner, {
      post_type: 'discussion',
      title: `Original #${hashtag}`,
    })

    await updatePost(editor, post!, {
      title: 'Moved by an editor',
      markdown: `#${hashtag}`,
    })
    await deleteUserAndDrainForTest(owner, owner)

    const alias = await createUnlinkedTopicAlias(hashtag)
    const relations = await getEntityRelation(
      'relation__post__category__topic_alias',
      post!.id,
      alias.id,
    )
    expect(relations[0]).toMatchObject({ votes_score_net: 1 })
  })
})
