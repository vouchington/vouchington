import { it, expect, describe } from 'vitest'
import { createTestUser, createTestPost, pollUntilNotNull } from '@voucha/test-helpers'
import { createTopic } from '@services/topics/create'
import { caches } from '@services/entity-cache/caches'
import { refresh } from './refresh.mts'

// user_metrics refresh is tested alongside refreshUserMetricsCache in ./metrics.test.mts.

describe('refresh', () => {
  it('refresh.topic_metrics sets metrics cache for topic id and slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Refresh Topic ${random}`,
      slug: `refresh-topic-${random}`,
    })
    await refresh.topic_metrics(topic.id)

    const byId = (await pollUntilNotNull(() => caches.topic_metrics.get(topic.id))) as Record<
      string,
      unknown
    >
    const bySlug = (await pollUntilNotNull(() => caches.topic_metrics.get(topic.slug))) as Record<
      string,
      unknown
    >
    expect(byId).not.toBeNull()
    expect(bySlug).not.toBeNull()
    expect(byId.id).toBe(topic.id)
    expect(bySlug.id).toBe(topic.id)
  })

  it('refresh.post_metrics sets metrics cache for post id', async () => {
    const user = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: user! })
    await refresh.post_metrics(post.id)

    const byId = (await pollUntilNotNull(() => caches.post_metrics.get(post.id))) as Record<
      string,
      unknown
    >
    expect(byId).not.toBeNull()
    expect(byId.id).toBe(post.id)
  })
})
