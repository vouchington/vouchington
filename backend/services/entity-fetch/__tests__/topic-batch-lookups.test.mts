import { describe, expect, it } from 'vitest'

import { createTestUser, insertTestTopic } from '@voucha/test-helpers'

import { getTopicByAny } from '@services/topics/get'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import type { Topic } from '@services/topics/types'

import { getTopicIdsByAnyCachedBatch } from '@services/entity-cache/lookups'

describe('topic batch lookups', () => {
  it('resolves merged topic IDs and active slugs in one batch', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const activeSlug = `lookup-batch-priority-${random}`
    const mergedSourceId = await insertTopic(user!.id, 'Merged Source', random)
    const mergedDestinationId = await insertTopic(user!.id, 'Merged Destination', random)
    const activeSlugTopicId = await insertTopic(user!.id, 'Active Slug', random, activeSlug)
    const mergedSource = await requireTopic(mergedSourceId)
    const mergedDestination = await requireTopic(mergedDestinationId)
    await mergeTopicAliases(user!, mergedSource, mergedDestination)

    await expect(
      getTopicIdsByAnyCachedBatch([mergedSource.id, activeSlug, mergedSource.slug]),
    ).resolves.toEqual([mergedDestination.id, activeSlugTopicId, mergedDestination.id])
  })
})

async function insertTopic(
  createdById: string,
  label: string,
  random: string,
  slug = `lookup-batch-${label.toLowerCase().replaceAll(' ', '-')}-${random}`,
): Promise<string> {
  return insertTestTopic({
    name: `Lookup Batch ${label} ${random}`,
    slug,
    createdById,
  })
}

async function requireTopic(topicId: string): Promise<Topic> {
  const topic = await getTopicByAny(topicId)
  if (!topic) throw new Error(`Test topic not found: ${topicId}`)
  return topic
}
