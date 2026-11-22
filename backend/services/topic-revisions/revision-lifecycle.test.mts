import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  mergeTopicForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { getTopicContentAttributionForTest } from '@voucha/test-helpers/entities/topic-revisions'
import { createTopicRevision } from './index.mts'

describe('topic revision lifecycle', () => {
  it('records deletion history after the topic is soft-deleted', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const topicId = await insertTestTopic({
      name: `Retained history ${suffix}`,
      slug: `retained-history-${suffix}`,
      createdById: user.id,
    })
    await softDeleteTopic(topicId, user.id)

    const changes = { deleted_at: { before: null, after: new Date().toISOString() } }
    await expect(createTopicRevision(topicId, 'delete', changes, user.id)).resolves.toMatchObject({
      topic_id: topicId,
      revision_type: 'delete',
      changes: { changes },
    })
  })

  it('rejects content history for a merged source without changing its attribution', async () => {
    const user = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID()
    const sourceId = await insertTestTopic({
      name: `History source ${suffix}`,
      slug: `history-source-${suffix}`,
      createdById: user.id,
    })
    const destinationId = await insertTestTopic({
      name: `History destination ${suffix}`,
      slug: `history-destination-${suffix}`,
      createdById: user.id,
    })
    await mergeTopicForTest(sourceId, destinationId, user.id)
    const previous = await getTopicContentAttributionForTest(sourceId)

    await expect(
      createTopicRevision(
        sourceId,
        'update',
        { markdown: { before: null, after: 'Late' } },
        user.id,
      ),
    ).rejects.toThrow('Topic revision requires an existing topic')
    await expect(getTopicContentAttributionForTest(sourceId)).resolves.toEqual(previous)
  })
})
