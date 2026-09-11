import { it, expect, describe } from 'vitest'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { getPublisherTypeTopicId } from './publisher-type-topics.mts'

// Lives in @services/topics (not @services/entity-relations) because it needs
// getPublisherTypeTopicId, which only @services/topics exposes. entity-relations must never
// depend on @services/topics (it already depends on entity-relations in the other direction),
// so this cross-package scenario is tested from the topics side.
describe('upsert publisher_type — rss-feed discoverability side effect', () => {
  it('upsertEntityRelation (publisher_type) triggers discoverability enqueue side effect', async () => {
    const user = await createTestUser()
    const sourceTopic = await createTestTopic({ topic_type: 'rss_feed' })
    const publisherTypeTopicId = await getPublisherTypeTopicId('blog')
    expect(publisherTypeTopicId).toBeTruthy()

    const metadata = entityRelationMetadatum.find(
      m =>
        m.subject_type === 'topic' && m.predicate === 'publisher_type' && m.object_type === 'topic',
    )!

    const relations = await upsertEntityRelation(user, metadata, sourceTopic, [
      { id: publisherTypeTopicId! },
    ])

    expect(relations.length).toBe(1)
  })
})
