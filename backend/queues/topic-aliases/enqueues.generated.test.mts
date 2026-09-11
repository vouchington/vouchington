import { beforeEach, describe, expect, it } from 'vitest'
import { TOPIC_ALIAS_ORDERING } from './config.mts'
import {
  enqueueContinueTopicAliasCategoryMappingReconciliation,
  enqueueReconcileTopicAliasCategoryMappings,
} from './enqueues.mts'
import { topicAliases } from './queues.mts'

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

describe('topic-aliases enqueues', () => {
  beforeEach(async () => {
    await topicAliases.obliterate({ force: true })
  })

  it('serializes durable category-mapping reconciliation', async () => {
    await enqueueReconcileTopicAliasCategoryMappings({ deduplicationId: 'topic-aliases-test' })

    const jobs = (await Promise.all(QUEUE_STATES.map(state => topicAliases.getJobs(state)))).flat()
    const job = jobs.find(job => job.name === 'processReconcileTopicAliasCategoryMappings')

    expect(job?.opts).toMatchObject({
      priority: 100,
      ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
      deduplication: {
        id: 'topic-aliases-test',
        mode: 'throttle',
        ttl: 60_000,
      },
    })
  })

  it('chains a full reconciliation page without throttle deduplication', async () => {
    await enqueueContinueTopicAliasCategoryMappingReconciliation()

    const jobs = (await Promise.all(QUEUE_STATES.map(state => topicAliases.getJobs(state)))).flat()
    const job = jobs.find(job => job.name === 'processReconcileTopicAliasCategoryMappings')

    expect(job?.opts).toMatchObject({
      priority: 100,
      ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
    })
    expect(job?.opts.deduplication).toBeUndefined()
  })
})
