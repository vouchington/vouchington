import { describe, expect, it } from 'vitest'
import { getRssFeedItemById } from '../get.mts'
import { getRssFeedItemCategories, upsertRssFeedItemCategories } from '../categories.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { searchRssFeedItems } from '../search.mts'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import { createTopicAliases } from '@services/topics/aliases'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import { getSystemUserByUsername } from '@services/users/system-users'
import {
  createTestTopic,
  createTestUser,
  getEntityRelation,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'

describe('RSS category snapshots', () => {
  it('reconciles shrink and empty snapshots before cached views or hashtag search are exposed', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const [topic, voter] = await Promise.all([
      createTestTopic({
        name: `RSS snapshot ${suffix}`,
        slug: `rss-snapshot-${suffix}`,
      }),
      createTestUser(),
    ])
    const [firstAlias, secondAlias] = await createTopicAliases(topic.id, [
      `rss-snapshot-first-${suffix}`,
      `rss-snapshot-second-${suffix}`,
    ])
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://rss-snapshot-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `RSS snapshot ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://rss-snapshot-${suffix}.example.com/item`,
        guid: `rss-snapshot-${suffix}`,
        title: `RSS snapshot ${suffix}`,
      },
    ])
    const firstCategory = `#${firstAlias!.alias}`
    const secondCategory = `#${secondAlias!.alias}`
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [firstCategory, secondCategory] },
    ])
    const topicRelation = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const [directRelation] = await upsertEntityRelation(
      voter!,
      topicRelation,
      { id: item!.id },
      [{ id: topic.id }],
      { vote: true },
    )

    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [firstCategory] }])
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([
      expect.objectContaining({ category_text: firstCategory }),
    ])
    await expect(
      searchRssFeedItems({ hashtag_alias_ids: [secondAlias!.id] }),
    ).resolves.toMatchObject({
      results: expect.not.arrayContaining([expect.objectContaining({ id: item!.id })]),
    })
    await expect(getRssFeedItemById(item!.id)).resolves.toMatchObject({
      categories: [
        expect.objectContaining({
          hashtag: expect.objectContaining({ id: firstAlias!.id }),
        }),
      ],
    })

    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [] }])
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    expect(categorizer).not.toBeNull()
    await expect(getRssFeedItemCategories(item!.id)).resolves.toEqual([])
    await expect(
      searchRssFeedItems({ hashtag_alias_ids: [firstAlias!.id] }),
    ).resolves.toMatchObject({
      results: expect.not.arrayContaining([expect.objectContaining({ id: item!.id })]),
    })
    await expect(getRssFeedItemById(item!.id)).resolves.not.toMatchObject({
      categories: [
        expect.objectContaining({ hashtag: expect.objectContaining({ id: firstAlias!.id }) }),
      ],
    })
    await expect(
      getEntityRelationElectionVote(voter!.id, directRelation!.id!),
    ).resolves.toMatchObject({
      choice: 'confirm',
    })
    await expect(
      getEntityRelationElectionVote(categorizer!.id, directRelation!.id!),
    ).resolves.toBeNull()
    await expect(getEntityRelation(topicRelation.table_name, item!.id, topic.id)).resolves.toEqual([
      expect.objectContaining({ deleted_at: null }),
    ])
  })
})
