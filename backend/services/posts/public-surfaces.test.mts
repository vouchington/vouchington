import { createTestTopic } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'

import { caches } from '@services/entity-cache/caches'
import { createTopicAliases } from '@services/topics/aliases'
import { invalidatePostPublicationTopicsStrict } from './public-surfaces.mts'

describe('strict post publication topic invalidation', () => {
  it('invalidates topic metric cache entries by canonical slug and alias', async () => {
    const topic = await createTestTopic()
    const alias = `publication-topic-cache-${crypto.randomUUID()}`
    await createTopicAliases(topic.id, alias)
    await Promise.all([
      caches.topic_metrics.set(topic.slug, { stale: true }),
      caches.topic_metrics.set(alias, { stale: true }),
    ])

    await invalidatePostPublicationTopicsStrict(topic.id)

    await expect(caches.topic_metrics.get(topic.slug)).resolves.toBeNull()
    await expect(caches.topic_metrics.get(alias)).resolves.toBeNull()
  })
})
