import { randomUUID } from 'node:crypto'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { getSystemUserByUsername } from '@services/users/system-users'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  applyTopicAliasUnlinkPageForTest,
  createTestTopic,
  getEntityRelation,
  insertTestRssFeedDirect,
  selectTopicAliasUnlinkInitialPageForTest,
} from '@voucha/test-helpers'
import {
  countTestRssFeedItemAliasCategoryBindings,
  getTestRssFeedItemCategories,
} from '@voucha/test-helpers/entities/rss-feed-item-categories'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, expect, it, onTestFinished } from 'vitest'
import { upsertRssFeedItemCategories } from './categories.mts'
import { upsertRssFeedItems } from './upsert.mts'
import { rssFeedItemsWorkConfig } from './work-limits.mts'

describe('topic alias unlink category page', () => {
  it('clears every mapping and categorizer vote before removing a larger binding page', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
        topic_alias_unlink_page_size: 3,
      }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, { category_clear_batch_size: 1 }),
    )
    const suffix = randomUUID()
    const topic = await createTestTopic({
      name: `Unlink category page ${suffix}`,
      slug: `unlink-category-page-${suffix}`,
    })
    const [alias] = await createTopicAliases(topic.id, `unlink-category-alias-${suffix}`)
    if (!alias) throw new Error('Expected topic alias')
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://unlink-category-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
    })
    const items = await upsertRssFeedItems(
      feed.id,
      Array.from({ length: 3 }, (_, index) => ({
        link: `https://unlink-category-${suffix}.example.com/item-${index}`,
        guid: `unlink-category-${suffix}-${index}`,
        title: `Unlink category ${index}`,
      })),
    )
    expect(items).toHaveLength(3)
    const itemIds = items.map(item => item.id)
    const categoryText = `#${alias.alias}`
    await upsertRssFeedItemCategories(
      itemIds.map(itemId => ({ rss_feed_item_id: itemId, categories: [categoryText] })),
    )
    expect(await countTestRssFeedItemAliasCategoryBindings(alias.id, itemIds)).toBe(3)
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    if (!categorizer) throw new Error('Expected RSS categorizer')
    const relationIds = await Promise.all(
      itemIds.map(async itemId => {
        const [relation] = await getEntityRelation(relationMetadata.table_name, itemId, topic.id)
        const id = (relation as { id?: string } | undefined)?.id
        if (!id) throw new Error(`Expected category relation for ${itemId}`)
        return id
      }),
    )
    for (const relationId of relationIds) {
      await expect(
        getEntityRelationElectionVote(categorizer.id, relationId),
      ).resolves.toMatchObject({
        choice: 'confirm',
      })
    }

    await unlinkTopicAlias(alias.id, { expectedTopicId: topic.id, skipSideEffects: true })
    const page = await selectTopicAliasUnlinkInitialPageForTest(alias.id, alias.alias)
    expect(page.phase).toBe('rss_item_categories')
    await applyTopicAliasUnlinkPageForTest(page)

    expect(await countTestRssFeedItemAliasCategoryBindings(alias.id, itemIds)).toBe(0)
    for (const itemId of itemIds) {
      await expect(getTestRssFeedItemCategories(itemId)).resolves.toContainEqual(
        expect.objectContaining({ category_text: categoryText, topic_id: null }),
      )
    }
    for (const relationId of relationIds) {
      await expect(getEntityRelationElectionVote(categorizer.id, relationId)).resolves.toBeNull()
    }
  })
})
