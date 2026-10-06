import { it, expect, describe } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createTopic } from './create.mts'
import { caches } from '@services/entity-cache/caches'
import { enqueueBulkRefreshTopicMetricsById } from '@queues/entity-metrics-cache-refresh/enqueues'

describe('enqueues.generated', () => {
  it('enqueueBulkRefreshTopicMetricsById refreshes topic metrics cache', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, WEB_PROVENANCE, {
      name: `Queue Topic ${random}`,
      slug: `queue-topic-${random}`,
    })
    // `processRefreshTopicMetrics` (the job below) reads the topic row directly via
    // `refresh.topic_metrics`, independent of `processTopicCreated`'s own side effects
    // (embedding/category/language-detection enqueues, cache invalidation) — no wait needed.

    await enqueueBulkRefreshTopicMetricsById([topic.id])

    expect(await caches.topic_metrics.get(topic.id)).not.toBeNull()
    expect(await caches.topic_metrics.get(topic.slug)).not.toBeNull()
  })
})
