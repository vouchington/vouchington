import { it, expect, describe } from 'vitest'
import { createTopicAliases } from '../aliases.mts'
import { getTopicAliases } from '../get-topic-aliases.mts'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { getTopicByAny } from '../get.mts'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { getTopicIdByAnyCached } from '@services/entity-cache/lookups'
import { mergeTopicAliases } from '../merge-aliases.mts'
import { ValkeyBloomFilter } from '@data-stores/valkey'
import { normalizeKey } from '@ts-shared/utils/strings'

describe('createTopicAliases', () => {
  it('creates single alias', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `test-alias-${random}`)
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`test-alias-${random}`)
  })

  it('creates multiple aliases from array', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, [`alias1-${random}`, `alias2-${random}`, `alias3-${random}`])
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`alias1-${random}`)
    expect(aliases).toContain(`alias2-${random}`)
    expect(aliases).toContain(`alias3-${random}`)
  })

  it('creates multiple aliases from semicolon-separated string', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `alias1-${random}; alias2-${random}; alias3-${random}`)
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`alias1-${random}`)
    expect(aliases).toContain(`alias2-${random}`)
    expect(aliases).toContain(`alias3-${random}`)
  })

  it('creates multiple aliases from comma-separated string', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `alias1-${random}, alias2-${random}, alias3-${random}`)
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`alias1-${random}`)
    expect(aliases).toContain(`alias2-${random}`)
    expect(aliases).toContain(`alias3-${random}`)
  })

  it('allows getTopicByAny to resolve alias', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    const alias = `alias-${random}`
    await createTopicAliases(topicId, alias)

    const topic = await getTopicByAny(alias)
    expect(topic?.id).toBe(topicId)
    expect(topic?.slug).toBe(`test-topic-${random}`)
  })

  it('normalizes aliases to lowercase', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `TEST-ALIAS-${random}`)
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`test-alias-${random}`)
    expect(aliases).not.toContain(`TEST-ALIAS-${random}`)
  })

  it('canonicalizes hash-prefixed aliases with the shared hashtag normalizer', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Hashtag alias topic ${random}`,
      slug: `hashtag-alias-topic-${random}`,
      createdById: user!.id,
    })

    await createTopicAliases(topicId, `#Travel_${random}`)

    await expect(getTopicAliases(topicId)).resolves.toMatchObject({
      results: expect.arrayContaining([`travel-${random}`]),
    })
  })

  it('trims whitespace from aliases', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, `  test-alias-${random}  `)
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases).toContain(`test-alias-${random}`)
  })

  it('removes duplicate aliases', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topicId, [`alias1-${random}`, `alias1-${random}`, `alias2-${random}`])
    const { results: aliases } = await getTopicAliases(topicId)

    expect(aliases.filter(a => a === `alias1-${random}`).length).toBe(1)
  })

  it('throws error when alias exists for different topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic1Id = await insertTestTopic({
      name: `Test Topic 1 ${random}`,
      slug: `test-topic-1-${random}`,
      createdById: user!.id,
    })
    const topic2Id = await insertTestTopic({
      name: `Test Topic 2 ${random}`,
      slug: `test-topic-2-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topic1Id, `shared-alias-${random}`)

    await expect(createTopicAliases(topic2Id, `shared-alias-${random}`)).rejects.toMatchObject({
      status: 409,
      message: `Alias already belongs to another topic: shared-alias-${random}`,
    })
  })

  it('never moves a linked alias to a different topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic1Id = await insertTestTopic({
      name: `Test Topic 1 ${random}`,
      slug: `test-topic-1-${random}`,
      createdById: user!.id,
    })
    const topic2Id = await insertTestTopic({
      name: `Test Topic 2 ${random}`,
      slug: `test-topic-2-${random}`,
      createdById: user!.id,
    })
    await createTopicAliases(topic1Id, `movable-alias-${random}`)
    await expect(createTopicAliases(topic2Id, `movable-alias-${random}`)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('invalidates topic lookup cache for newly created aliases', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `Create Alias Cache Topic ${random}`,
      slug: `create-alias-cache-topic-${random}`,
      createdById: user!.id,
    })
    const alias = `create-cache-alias-${random}`
    expect(await getTopicIdByAnyCached(alias)).toBeNull()

    await createTopicAliases(topicId, alias)
    expect(await getTopicIdByAnyCached(alias)).toBe(topicId)
  })

  it('keeps topic lookup cache at the linked topic when a claim conflicts', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const topic1Id = await insertTestTopic({
      name: `Alias Move Topic 1 ${random}`,
      slug: `alias-move-topic-1-${random}`,
      createdById: user!.id,
    })
    const topic2Id = await insertTestTopic({
      name: `Alias Move Topic 2 ${random}`,
      slug: `alias-move-topic-2-${random}`,
      createdById: user!.id,
    })
    const alias = `movable-cache-alias-${random}`
    await createTopicAliases(topic1Id, alias)
    expect(await getTopicIdByAnyCached(alias)).toBe(topic1Id)

    await expect(createTopicAliases(topic2Id, alias)).rejects.toMatchObject({ status: 409 })
    expect(await getTopicIdByAnyCached(alias)).toBe(topic1Id)
  })
})

describe('bloom filter', () => {
  const suffix = Math.random().toString(36).slice(2, 10)

  it('createTopicAliases adds aliases to topics bloom filter', async () => {
    const originalTopicsBloomFilter = entityCacheBloomFilters.topics
    const originalConfig = originalTopicsBloomFilter.getConfig()
    const testTopicsBloomFilter = new ValkeyBloomFilter({
      name: `topics-alias-create-test-${suffix}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })
    const user = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `BF Topic ${suffix}`,
      slug: `bf-topic-${suffix}`,
      createdById: user!.id,
    })

    const alias = `bf-alias-${suffix}`
    const normalizedAlias = normalizeKey(alias)

    entityCacheBloomFilters.topics = testTopicsBloomFilter
    try {
      await testTopicsBloomFilter.delete()
      await testTopicsBloomFilter.ensureExists()

      await createTopicAliases(topicId, alias)

      await expect.poll(() => testTopicsBloomFilter.exists(normalizedAlias)).toBe(true)
      expect(await testTopicsBloomFilter.exists(`definitely-not-${suffix}`)).toBe(false)
    } finally {
      entityCacheBloomFilters.topics = originalTopicsBloomFilter
      await testTopicsBloomFilter.delete().catch(() => {})
    }
  })

  it('rejects aliases for merged source topics', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const user = await createTestUser({ administrator: true })
    const sourceId = await insertTestTopic({
      name: `Merged Source ${random}`,
      slug: `merged-source-${random}`,
      createdById: user!.id,
    })
    const destinationId = await insertTestTopic({
      name: `Merged Destination ${random}`,
      slug: `merged-destination-${random}`,
      createdById: user!.id,
    })
    const source = await getTopicByAny(sourceId)
    const destination = await getTopicByAny(destinationId)
    expect(source).toBeDefined()
    expect(destination).toBeDefined()

    await mergeTopicAliases(user!, source!, destination!)

    await expect(createTopicAliases(sourceId, `orphaned-alias-${random}`)).rejects.toMatchObject({
      status: 409,
    })
    await expect(getTopicAliases(sourceId)).resolves.toEqual({ results: [], hasNextPage: false })
  })
})
