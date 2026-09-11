import { it, expect, describe } from 'vitest'
import { updateTopic } from './update.mts'
import { getTopicByAny } from './get.mts'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { getTopicIdByAnyCached } from '@services/entity-cache/lookups'
import { ValkeyBloomFilter } from '@data-stores/valkey'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { normalizeKey } from '@ts-shared/utils/strings'
describe('updateTopic', () => {
  it('updates topic name', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    const updatedTopic = await updateTopic(user!, topic!, { name: `Updated Name ${random}` })

    expect(updatedTopic).toBeDefined()
    expect(updatedTopic!.name).toBe(`Updated Name ${random}`)
  })

  it('updates topic slug', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    const newSlug = `updated-slug-${random}`
    const updatedTopic = await updateTopic(user!, topic!, { slug: newSlug })

    expect(updatedTopic).toBeDefined()
    expect(updatedTopic!.slug).toBe(newSlug)
  })

  it('updates topic markdown', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    const updatedTopic = await updateTopic(user!, topic!, { markdown: 'Updated markdown content' })

    expect(updatedTopic).toBeDefined()
    expect(updatedTopic!.markdown).toBe('Updated markdown content')
  })

  it('updateTopic adds new slug to topics bloom filter', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const originalTopicsBloomFilter = entityCacheBloomFilters.topics
    const originalConfig = originalTopicsBloomFilter.getConfig()
    const testTopicsBloomFilter = new ValkeyBloomFilter({
      name: `topics-update-test-${random}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })

    const topic = await getTopicByAny(topicId)
    const newSlug = `bloom-slug-${random}`
    const normalizedNewSlug = normalizeKey(newSlug)

    entityCacheBloomFilters.topics = testTopicsBloomFilter
    try {
      await testTopicsBloomFilter.delete()
      await testTopicsBloomFilter.ensureExists()

      await updateTopic(user!, topic!, { slug: newSlug })

      await expect.poll(() => testTopicsBloomFilter.exists(normalizedNewSlug)).toBe(true)
    } finally {
      entityCacheBloomFilters.topics = originalTopicsBloomFilter
      await testTopicsBloomFilter.delete().catch(() => {})
    }
  })

  it('sets updated_by_id to updater user', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const creator = await createTestUser({ administrator: true })
    const updater = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: creator!.id,
    })
    const topic = await getTopicByAny(topicId)
    const updatedTopic = await updateTopic(updater!, topic!, {
      name: `Updated by different user ${random}`,
    })

    expect(updatedTopic).toBeDefined()
    expect(updatedTopic!.updated_by.id).toBe(updater!.id)
  })

  it('persists noindex and allow_reviews flags', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Flags Topic ${random}`,
      slug: `flags-topic-${random}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    const updatedTopic = await updateTopic(user!, topic!, {
      noindex: true,
      allow_reviews: false,
    })

    expect(updatedTopic!.noindex).toBe(true)
    expect(updatedTopic!.allow_reviews).toBe(false)

    const reloaded = await getTopicByAny(topicId)
    expect(reloaded!.noindex).toBe(true)
    expect(reloaded!.allow_reviews).toBe(false)
  })

  it('rejects a non-boolean noindex with 422', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Flags Topic ${random}`,
      slug: `flags-noindex-${random}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    await expect(
      updateTopic(user!, topic!, { noindex: 'yes' as unknown as boolean }),
    ).rejects.toMatchObject({ status: 422, message: 'noindex must be a boolean' })
  })

  it('rejects a non-boolean allow_reviews with 422', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Flags Topic ${random}`,
      slug: `flags-allow-reviews-${random}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    await expect(
      updateTopic(user!, topic!, { allow_reviews: 1 as unknown as boolean }),
    ).rejects.toMatchObject({ status: 422, message: 'allow_reviews must be a boolean' })
  })

  it('rejects changing topic_type to a removed type with 422', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Removed Type Topic ${random}`,
      slug: `removed-type-${random}`,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    await expect(
      updateTopic(user!, topic!, {
        topic_type: 'brand' as unknown as NonNullable<typeof topic>['topic_type'],
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Invalid topic type: brand' })
  })

  it('invalidates topic lookup cache for old and new slug when slug changes', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const originalSlug = `lookup-topic-${random}`
    const topicId = await insertTestTopic({
      name: `Lookup Topic ${random}`,
      slug: originalSlug,
      createdById: user!.id,
    })
    const topic = await getTopicByAny(topicId)
    await getTopicIdByAnyCached(originalSlug)

    const newSlug = `lookup-topic-updated-${random}`
    await updateTopic(user!, topic!, { slug: newSlug })

    const oldLookup = await getTopicIdByAnyCached(originalSlug)
    const newLookup = await getTopicIdByAnyCached(newSlug)

    expect(oldLookup).toBe(topicId)
    expect(newLookup).toBe(topicId)
  })
})
