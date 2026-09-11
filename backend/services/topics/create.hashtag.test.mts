import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestTopicAliasRowVersion,
  insertTestTopic,
  mergeTopicForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { createTopicAliases, createUnlinkedTopicAlias } from './aliases.mts'
import { createTopic } from './create.mts'
import { getTopicIdByAnyCached } from '@services/entity-cache/lookups'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { ValkeyBloomFilter } from '@data-stores/valkey'
import { normalizeKey } from '@ts-shared/utils/strings'

describe('createTopic hashtag alias source', () => {
  it('returns an existing alias without rewriting its shared row', async () => {
    const hashtag = `hot-alias-${Math.random().toString(36).slice(2, 12)}`
    const first = await createUnlinkedTopicAlias(hashtag)
    const before = await getTestTopicAliasRowVersion(first.id)

    const second = await createUnlinkedTopicAlias(hashtag)

    expect(second).toEqual(first)
    expect(await getTestTopicAliasRowVersion(first.id)).toBe(before)
  })

  it.each(['soft-deleted', 'merged'] as const)(
    'reclaims a %s source alias before claiming the matching topic slug',
    async staleState => {
      const suffix = Math.random().toString(36).slice(2, 12)
      const user = await createTestUser({ administrator: true })
      const sourceAlias = `source-${suffix}`
      const staleTopicId = await insertTestTopic({
        name: `Stale source alias ${suffix}`,
        slug: `stale-source-alias-${suffix}`,
        createdById: user!.id,
      })
      const [alias] = await createTopicAliases(staleTopicId, `#${sourceAlias}`)

      if (staleState === 'soft-deleted') {
        await softDeleteTopic(staleTopicId, user!.id)
      } else {
        const mergeDestinationId = await insertTestTopic({
          name: `Merge destination ${suffix}`,
          slug: `merge-destination-${suffix}`,
          createdById: user!.id,
        })
        await mergeTopicForTest(staleTopicId, mergeDestinationId, user!.id)
      }

      const topic = await createTopic(user!, {
        name: `Reclaimed source alias ${suffix}`,
        slug: sourceAlias,
        source_topic_alias_id: alias!.id,
      })

      expect(topic.aliases).toContain(sourceAlias)
    },
  )

  it('claims the selected unlinked alias in the same topic-create transaction', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const alias = await createUnlinkedTopicAlias(`#source_${suffix}`)
    const originalBloomFilter = entityCacheBloomFilters.topics
    const originalConfig = originalBloomFilter.getConfig()
    const testBloomFilter = new ValkeyBloomFilter({
      name: `topic-source-alias-${suffix}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })
    entityCacheBloomFilters.topics = testBloomFilter
    try {
      await testBloomFilter.delete()
      await testBloomFilter.ensureExists()
      const topic = await createTopic(user!, {
        name: `Source alias ${suffix}`,
        slug: `source-alias-${suffix}`,
        source_topic_alias_id: alias.id,
      })
      const sourceAlias = `source-${suffix}`
      expect(topic.aliases).toContain(sourceAlias)
      await expect.poll(() => testBloomFilter.exists(normalizeKey(sourceAlias))).toBe(true)
      await expect(getTopicIdByAnyCached(sourceAlias)).resolves.toBe(topic.id)
    } finally {
      entityCacheBloomFilters.topics = originalBloomFilter
      await testBloomFilter.delete().catch(() => {})
    }
  })

  it('revives a deleted source-alias owner whose canonical slug is requested', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const user = await createTestUser({ administrator: true })
    const slug = `revived-source-${suffix}`
    const staleTopicId = await insertTestTopic({
      name: `Deleted source ${suffix}`,
      slug,
      createdById: user!.id,
    })
    const [alias] = await createTopicAliases(staleTopicId, slug)
    await softDeleteTopic(staleTopicId, user!.id)

    const topic = await createTopic(user!, {
      name: `Revived source ${suffix}`,
      slug,
      source_topic_alias_id: alias!.id,
    })

    expect(topic).toMatchObject({ id: staleTopicId, name: `Revived source ${suffix}`, slug })
  })
})
