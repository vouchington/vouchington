import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { queryRssFeedBaseState } from '@voucha/test-helpers/data-stores/psql/views/view-rss-feed-current-states'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getEntityRelations } from '@services/entity-relations/query'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import { disableAndHideSource } from '../rss-feeds/disable-and-hide-source.mts'
import { getTopicByAny } from './get.mts'
import { getPublisherTypeTopics } from './publisher-type-topics.mts'
import { createTopicMergeOperation, getTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'

async function createRssFeedTopic(admin: Awaited<ReturnType<typeof createTestUser>>) {
  const row = await createTestTopic({ user: admin, topic_type: 'rss_feed' })
  const topic = await getTopicByAny(row.id)
  if (!topic) throw new Error(`Test topic not found: ${row.id}`)
  return topic
}

describe('topic merge ownership and lifecycle ordering', () => {
  it('preserves a publisher-type writer committed before the merge pages run', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createRssFeedTopic(admin)
    const destination = await createRssFeedTopic(admin)
    const publisherTypeId = (await getPublisherTypeTopics()).find(
      topic => topic.slug === 'blog',
    )?.id
    if (!publisherTypeId) throw new Error('Publisher-type fixture not seeded')
    const publisherType = getEntityRelationMetadataOrThrow({
      subjectType: 'topic',
      objectType: 'topic',
      predicate: 'publisher_type',
    })

    await using writer = await beginTransaction()
    await lockTopicRssFeedAttachmentLifecycles(writer, [destination.id])
    await writeEntityRelations(
      publisherType,
      admin,
      [{ subject: destination, object: { id: publisherTypeId } }],
      { query: writer, vote: false },
    )
    await writer.commit()
    const operation = await createTopicMergeOperation(admin, source, destination)
    expect(operation.status).toBe('queued')
    let generation: number | null = 0
    for (let page = 0; page < 2000 && generation !== null; page++) {
      generation = await processTopicMergeOperationPage(operation.id, generation)
    }
    expect(generation).toBeNull()
    await expect(getTopicMergeOperation(admin, source.id, operation.id)).resolves.toMatchObject({
      status: 'completed',
    })
    const relations = await getEntityRelations('topic', destination.id, 'publisher_type', 'topic', {
      viewer: { kind: 'anonymous' },
    })
    expect(relations.map(relation => relation.object_id)).toContain(publisherTypeId)
  })

  it('rejects admission after a source hide has committed', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createRssFeedTopic(admin)
    const destination = await createRssFeedTopic(admin)
    const feed = await insertTestRssFeedDirect({ topicId: source.id })

    await disableAndHideSource(feed.id)
    await expect(createTopicMergeOperation(admin, source, destination)).rejects.toMatchObject({
      status: 404,
    })
    expect(await getTopicByAny(source.id)).toBeNull()
    expect(await queryRssFeedBaseState(feed.id)).toMatchObject({ is_enabled: false })
  })

  it('refuses a source hide while the merge operation reserves it', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createRssFeedTopic(admin)
    const destination = await createRssFeedTopic(admin)
    const feed = await insertTestRssFeedDirect({ topicId: source.id })
    const operation = await createTopicMergeOperation(admin, source, destination)
    expect(operation.status).toBe('queued')
    await expect(disableAndHideSource(feed.id)).rejects.toMatchObject({
      code: 'topic_merge_in_progress',
    })
    expect(await getTopicByAny(source.id)).toMatchObject({ id: source.id })
    expect(await queryRssFeedBaseState(feed.id)).toMatchObject({ is_enabled: true })
  })
})
