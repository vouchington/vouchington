import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { getTopicByAny } from './get.mts'
import { updateTopic } from './update.mts'
import { createTopicMergeOperation, getTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'

describe('topic merge type revalidation', () => {
  it.each(['source', 'destination'] as const)(
    'rejects a %s type change while the operation reserves both participants',
    async changedTopic => {
      const admin = await createTestUser({ administrator: true })
      const source = (await getTopicByAny(
        (await createTestTopic({ user: admin, topic_type: 'topic' })).id,
      ))!
      const destination = (await getTopicByAny(
        (await createTestTopic({ user: admin, topic_type: 'topic' })).id,
      ))!
      const operation = await createTopicMergeOperation(admin, source, destination)
      expect(operation.status).toBe('queued')
      await expect(
        updateTopic(
          admin,
          changedTopic === 'source' ? source : destination,
          { topic_type: 'card' },
          { skipSideEffects: true, allowTypeChange: true },
        ),
      ).rejects.toMatchObject({ status: 409, code: 'topic_merge_in_progress' })
      let generation: number | null = 0
      for (let page = 0; page < 2000 && generation !== null; page++) {
        generation = await processTopicMergeOperationPage(operation.id, generation)
      }
      expect(generation).toBeNull()
      await expect(getTopicMergeOperation(admin, source.id, operation.id)).resolves.toMatchObject({
        status: 'completed',
        error_code: null,
      })
      await expect(getTopicByAny(source.id)).resolves.toMatchObject({
        id: destination.id,
        topic_type: 'topic',
      })
      await expect(getTopicByAny(destination.id)).resolves.toMatchObject({
        id: destination.id,
        topic_type: 'topic',
      })
    },
  )
})
