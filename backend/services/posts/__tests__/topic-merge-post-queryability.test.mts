import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, createTestPost } from '@voucha/test-helpers'
import { getTopicByAny } from '@services/topics/get'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import type { Topic } from '@services/topics/types'
import { getPostIds } from '../search/get-ids.mts'
import { waitForPostMatchingRelatedTopicIds } from '../search/test-support.mts'

// Relocated from backend/services/topics/merge-aliases.test.mts: this case asserts posts search
// (getPostIds) still surfaces the source topic's tagged posts after a merge. @services/topics must
// not depend on @services/posts (posts already prod-deps topics, the kept direction), so this test
// lives here.
async function createFullTestTopic(options: Parameters<typeof createTestTopic>[0]): Promise<Topic> {
  const topic = await createTestTopic(options)
  const fullTopic = await getTopicByAny(topic.id)
  if (!fullTopic) throw new Error(`Test topic not found: ${topic.id}`)
  return fullTopic
}

describe('mergeTopicAliases - post queryability', () => {
  it('posts tagged with a merged source topic remain queryable by source topic id', async () => {
    const admin = await createTestUser({ administrator: true })
    const contributor = await createTestUser()
    const source = await createFullTestTopic({ user: admin, name: `Post Source ${Date.now()}` })
    const destination = await createFullTestTopic({
      user: admin,
      name: `Post Destination ${Date.now()}`,
    })

    const post = (await createTestPost({ user: contributor }))!
    const postTopicCategoryRelation = entityRelationMetadatum.find(
      m => m.subject_type === 'post' && m.object_type === 'topic' && m.predicate === 'category',
    )!
    await upsertEntityRelation(contributor, postTopicCategoryRelation, post, [source])

    await mergeTopicAliases(admin, source, destination)

    // Posts tagged with the source topic must still be queryable by source topic id.
    // The post-search path uses the relation table (object_id = topicId) and does not
    // filter topics by merged_into_topic_id, so merge must not break post discovery.
    await waitForPostMatchingRelatedTopicIds(admin, post.id, [source.id], 25)
    const result = await getPostIds(admin, { related_topic_ids: [source.id], limit: 25 })
    const postIds = result.results.map(r => r.id)
    expect(postIds).toContain(post.id)
  })
})
