import { beforeEach, describe, expect, it } from 'vitest'
import { v4 as uuid } from 'uuid'

import { getRssFeedItemById } from '../get.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import {
  backfillCategoriesForTopicAliases,
  getRssFeedItemCategories,
  upsertRssFeedItemCategories,
} from '../categories.mts'
import { createTopicAliases, linkTopicAlias, unlinkTopicAlias } from '@services/topics/aliases'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import { getSystemUserByUsername } from '@services/users/system-users'
import {
  createTestTopic,
  getEntityRelation,
  getEntityRelationVersion,
  getTestPostPublicationDirtyWorkForScope,
  getTopicAliasIdForTest,
  hardDeleteEntityRelationTest,
  insertTestRssFeedDirect,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'

describe('RSS feed item category relation retries', () => {
  let rssFeedItemId: string
  let topicId: string
  let hashtag: string

  beforeEach(async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      name: `RSS category retry ${random}`,
      slug: `rss-category-retry-${random}`,
      hostname: `rss-category-retry-${random}.example.com`,
    })
    topicId = topic.id
    hashtag = `rss-category-retry-${random}`
    await createTopicAliases(topic.id, [hashtag])
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://rss-category-retry-${random}.example.com/feed.xml`,
      topicId: topic.id,
      title: `RSS category retry ${random}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://rss-category-retry-${uuid()}.example.com/item`,
        guid: `rss-category-retry-${uuid()}`,
        title: 'RSS category retry item',
        categories: [hashtag],
      },
    ])
    rssFeedItemId = item!.id
  })

  it('does not rewrite an unchanged hashtag category relation on repeated ingestion', async () => {
    await upsertRssFeedItemCategories([{ rss_feed_item_id: rssFeedItemId, categories: [hashtag] }])
    await expect
      .poll(async () => {
        const item = await getRssFeedItemById(rssFeedItemId)
        return item?.categories?.some(category => category.hashtag?.key === hashtag)
      })
      .toBe(true)

    const aliasId = await getTopicAliasIdForTest(hashtag)
    expect(aliasId).not.toBeNull()
    const versionBefore = await getEntityRelationVersion(
      'relation__rss_feed_item__category__topic_alias',
      rssFeedItemId,
      aliasId!,
    )
    expect(versionBefore).not.toBeNull()

    await upsertRssFeedItemCategories([{ rss_feed_item_id: rssFeedItemId, categories: [hashtag] }])

    await expect(
      getEntityRelationVersion(
        'relation__rss_feed_item__category__topic_alias',
        rssFeedItemId,
        aliasId!,
      ),
    ).resolves.toBe(versionBefore)
  })

  it('recreates missing category relations after their mapping columns were persisted', async () => {
    await upsertRssFeedItemCategories([{ rss_feed_item_id: rssFeedItemId, categories: [hashtag] }])

    const aliasId = await getTopicAliasIdForTest(hashtag)
    expect(aliasId).not.toBeNull()
    await Promise.all([
      hardDeleteEntityRelationTest(
        'relation__rss_feed_item__category__topic',
        rssFeedItemId,
        topicId,
      ),
      hardDeleteEntityRelationTest(
        'relation__rss_feed_item__category__topic_alias',
        rssFeedItemId,
        aliasId!,
      ),
    ])

    await expect(getRssFeedItemCategories(rssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ topic_id: topicId })]),
    )
    const before = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId!,
    })

    await upsertRssFeedItemCategories([{ rss_feed_item_id: rssFeedItemId, categories: [hashtag] }])

    const after = await getTestPostPublicationDirtyWorkForScope({
      type: 'topic_alias',
      id: aliasId!,
    })
    expect(Number(after!.generation)).toBeGreaterThan(Number(before!.generation))
    expect(after!.reasons).toContain('post_topics_changed')

    await expect(
      getEntityRelation('relation__rss_feed_item__category__topic', rssFeedItemId, topicId),
    ).resolves.toEqual([expect.objectContaining({ deleted_at: null })])
    await expect(
      getEntityRelation('relation__rss_feed_item__category__topic_alias', rssFeedItemId, aliasId!),
    ).resolves.toEqual([expect.objectContaining({ deleted_at: null })])
    await expect
      .poll(async () => {
        const item = await getRssFeedItemById(rssFeedItemId)
        return item?.categories?.some(category => category.hashtag?.key === hashtag)
      })
      .toBe(true)
  })

  it('restores missing categorizer votes on existing category relations', async () => {
    await upsertRssFeedItemCategories([{ rss_feed_item_id: rssFeedItemId, categories: [hashtag] }])

    const aliasId = await getTopicAliasIdForTest(hashtag)
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    const [topicRelation] = await getEntityRelation(
      'relation__rss_feed_item__category__topic',
      rssFeedItemId,
      topicId,
    )
    const [hashtagRelation] = await getEntityRelation(
      'relation__rss_feed_item__category__topic_alias',
      rssFeedItemId,
      aliasId!,
    )
    const topicRelationId = (topicRelation as { id?: string } | undefined)?.id
    const hashtagRelationId = (hashtagRelation as { id?: string } | undefined)?.id
    expect(categorizer).not.toBeNull()
    expect(topicRelationId).toBeDefined()
    expect(hashtagRelationId).toBeDefined()

    const topicMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const hashtagMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic_alias',
      predicate: 'category',
    })
    await Promise.all([
      upsertEntityRelationElectionVotes(
        categorizer!.id,
        [{ entityId: topicRelationId!, score: 0 }],
        undefined,
        topicMetadata,
      ),
      upsertEntityRelationElectionVotes(
        categorizer!.id,
        [{ entityId: hashtagRelationId!, score: 0 }],
        undefined,
        hashtagMetadata,
      ),
    ])

    await upsertRssFeedItemCategories([{ rss_feed_item_id: rssFeedItemId, categories: [hashtag] }])

    await expect(
      getEntityRelationElectionVote(categorizer!.id, topicRelationId!),
    ).resolves.toMatchObject({ choice: 'confirm' })
    await expect(
      getEntityRelationElectionVote(categorizer!.id, hashtagRelationId!),
    ).resolves.toMatchObject({ choice: 'confirm' })
  })

  it('rolls back backfill mappings when primary relation stats persistence fails', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const movedAlias = `rss-retry-moved-${suffix}`
    await createTopicAliases(topicId, movedAlias)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: rssFeedItemId, categories: [movedAlias] },
    ])
    const aliasId = await getTopicAliasIdForTest(movedAlias)
    const destination = await createTestTopic({
      name: `RSS retry destination ${suffix}`,
      slug: `rss-retry-destination-${suffix}`,
    })
    await unlinkTopicAlias(aliasId!, { expectedTopicId: topicId, skipSideEffects: true })
    await linkTopicAlias(destination.id, aliasId!, { skipSideEffects: true })

    await expect(
      withFailingTransactionQueryOptionsForTest(
        'updateEntityRelationElectionVoteStatsFromPrimaryBatch',
        options => backfillCategoriesForTopicAliases(destination.id, options),
      ),
    ).rejects.toThrow(
      'Injected query failure for updateEntityRelationElectionVoteStatsFromPrimaryBatch',
    )
    await expect(getRssFeedItemCategories(rssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_text: movedAlias, topic_id: topicId }),
      ]),
    )

    await expect(backfillCategoriesForTopicAliases(destination.id)).resolves.toMatchObject({
      updated: 1,
    })
    await expect(getRssFeedItemCategories(rssFeedItemId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category_text: movedAlias, topic_id: destination.id }),
      ]),
    )
  })
})
