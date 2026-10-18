import assert from 'node:assert/strict'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { approveTestPost } from '../../test-helpers/entities/post-clearance.mts'
import { CONTRIBUTING_USER_AGE_MS } from '../../test-helpers/entities/contribution-gating.mts'
import { createRandomString } from '../../test-helpers/data.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { createTestUserWithAge } from '../../test-helpers/entities/users-direct.mts'
import { createTestTopic } from '../../test-helpers/entities/create-test-entities.mts'
import { getEntityRelation } from '../../test-helpers/entities/entity-relations.mts'
import { WEB_PROVENANCE } from '../../test-helpers/entities/content-provenance.mts'
import { createUnlinkedTopicAlias, linkTopicAlias, searchTopHashtags } from '@services/topics'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'
import { createPost } from '@services/posts/create'
import { getPostByAny } from '@services/posts/get'
import { getPostIds } from '@services/posts/search/get-ids'

export async function checkHashtagAuthorDeletionContract(): Promise<void> {
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

  const relations = await getEntityRelation(
    'relation__post__category__topic_alias',
    sourcePost!.id,
    alias.id,
  )
  const relation = relations[0]
  assert.ok(relation && typeof relation === 'object' && 'votes_score_net' in relation)
  assert.equal(relation.votes_score_net, 0)
  const retained = (await getPostByAny(sourcePost!.id))?.post_hashtags
  assert.ok(
    retained?.some(row => row.key === hashtag),
    'authored token must remain on the post',
  )
  const search = await getPostIds(viewer, { hashtag_topic_ids: [topic.id], limit: 100 })
  assert.ok(!search.results.some(row => row.id === sourcePost!.id))

  await refreshMaterializedView('mv_top_hashtags')
  const { results } = await searchTopHashtags({ q: hashtag })
  assert.ok(!results.some(row => row.topic_alias_id === alias.id))
}
