import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { TOPIC_ALIAS_ORDERING } from '../config.mts'
import {
  enqueueContinueTopicAliasCategoryMappingReconciliation,
  enqueueReconcileTopicAliasCategoryMappings,
} from './topic-aliases.mts'
import { rssFeedMaintenance } from '../queues.mts'

describe('topic-aliases enqueues', () => {
  it('serializes durable category-mapping reconciliation', async () => {
    const deduplicationId = `topic-aliases-test-${randomUUID()}`
    const job = await readEnqueuedJob(
      rssFeedMaintenance,
      await enqueueReconcileTopicAliasCategoryMappings({ deduplicationId }),
    )
    try {
      expect(job.opts).toMatchObject({
        priority: 100,
        ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
        deduplication: {
          id: deduplicationId,
          mode: 'throttle',
          ttl: 60_000,
        },
      })
    } finally {
      await job.remove()
    }
  })

  it('chains a full reconciliation page without throttle deduplication', async () => {
    const job = await readEnqueuedJob(
      rssFeedMaintenance,
      await enqueueContinueTopicAliasCategoryMappingReconciliation(),
    )
    try {
      expect(job.opts).toMatchObject({
        priority: 100,
        ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
      })
      expect(job.opts.deduplication).toBeUndefined()
    } finally {
      await job.remove()
    }
  })
})
