import { it, expect, describe, beforeEach } from 'vitest'
import { createTestTopic, createRandomString } from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { upsertRssFeedCategories } from '../categories.mts'
import { createFeedCategoryRelations } from '../category-relations.mts'
import { getEntityRelations } from '@services/entity-relations/query'
import { SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations/viewer'

describe('createFeedCategoryRelations', () => {
  let rssFeedId: string
  let showTopicId: string
  let categoryTopicId: string
  let categorySlug: string

  beforeEach(async () => {
    const random = createRandomString(12)
    categorySlug = `cat-${random}`

    // Create the podcast show topic (what the feed is about)
    const showTopic = await createTestTopic({
      name: `Show Topic ${random}`,
      slug: `show-${random}`,
      hostname: `show-${random}.example.com`,
    })
    showTopicId = showTopic.id

    // Create a feed linked to the show topic
    const feed = await createTestRssFeed({ topicId: showTopicId })
    rssFeedId = feed.id

    // Create a category topic whose slug matches the category text so topic_id resolves
    const categoryTopic = await createTestTopic({
      name: `Category ${random}`,
      slug: categorySlug,
    })
    categoryTopicId = categoryTopic.id
  }, 60_000)

  it('creates category entity relations for mapped categories', async () => {
    // Upsert categories — resolves topic_id via slug match
    await upsertRssFeedCategories(rssFeedId, [categorySlug])

    await createFeedCategoryRelations(rssFeedId)

    const relations = await getEntityRelations('topic', showTopicId, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    })
    const match = relations.find(r => r.object_id === categoryTopicId)
    expect(match).toBeDefined()
    expect(match!.subject_id).toBe(showTopicId)
  }, 30_000)

  it('is idempotent — re-running does not duplicate the relation row', async () => {
    await upsertRssFeedCategories(rssFeedId, [categorySlug])

    await createFeedCategoryRelations(rssFeedId)
    await createFeedCategoryRelations(rssFeedId)

    const relations = await getEntityRelations('topic', showTopicId, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    })
    const matches = relations.filter(r => r.object_id === categoryTopicId)
    expect(matches).toHaveLength(1)
  }, 30_000)

  it('returns without error when no categories have a resolved topic_id', async () => {
    const unmapped = `unmapped-${createRandomString(8)}`
    await upsertRssFeedCategories(rssFeedId, [unmapped])

    await expect(createFeedCategoryRelations(rssFeedId)).resolves.not.toThrow()

    const relations = await getEntityRelations('topic', showTopicId, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    })
    expect(relations).toHaveLength(0)
  }, 30_000)

  it('returns without error when the feed has no categories at all', async () => {
    // No upsertRssFeedCategories call — empty category set
    await expect(createFeedCategoryRelations(rssFeedId)).resolves.not.toThrow()

    const relations = await getEntityRelations('topic', showTopicId, 'category', 'topic', {
      viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    })
    expect(relations).toHaveLength(0)
  }, 30_000)
})
