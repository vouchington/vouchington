import { describe, expect, it } from 'vitest'

import {
  clearCategoriesForUnlinkedTopicAlias,
  getRssFeedItemCategories,
  upsertRssFeedItemCategories,
} from '../categories.mts'
import { applyCollaborativeTopicRelations } from '../collaborative-topic-relations.mts'
import { clearCategorizerVotesForUnreferencedCategoryTopicRelations } from '../category-topic-votes.mts'
import { upsertRssFeedItems } from '../upsert.mts'

import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations'
import { getEntityRelationElectionVote } from '@services/elections-votes/entity-relation/votes-get'
import { createTopicAliases, unlinkTopicAlias } from '@services/topics/aliases'
import {
  RSS_FEED_CATEGORIZER_USERNAME,
  RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME,
} from '@services/users/constants'
import { getSystemUserByUsername } from '@services/users/system-users'
import {
  createTestTopic,
  createTestUser,
  createTestMembership,
  followTopicById,
  getEntityRelation,
  insertEntityRelation,
  insertTestRssFeedDirect,
  holdTestEntityRelationVoteLock,
  setTestRssFeedItemCategoryTopicId,
  testCategorizerVoteLockHasWaiter,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'

describe('clearCategoriesForUnlinkedTopicAlias votes', () => {
  it('rolls back category clearing when primary relation stats persistence fails', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const topic = await createTestTopic({
      name: `RSS category rollback ${suffix}`,
      slug: `rss-category-rollback-${suffix}`,
    })
    const [alias] = await createTopicAliases(topic.id, `rss-category-rollback-alias-${suffix}`)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://rss-category-rollback-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `RSS category rollback ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://rss-category-rollback-${suffix}.example.com/item`,
        guid: `rss-category-rollback-${suffix}`,
        title: `RSS category rollback ${suffix}`,
      },
    ])
    const categoryText = `#${alias!.alias}`
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [categoryText] }])
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const [relation] = await getEntityRelation(relationMetadata.table_name, item!.id, topic.id)
    const relationId = (relation as { id?: string } | undefined)?.id
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    expect(relationId).toBeDefined()
    expect(categorizer).not.toBeNull()

    await unlinkTopicAlias(alias!.id, { expectedTopicId: topic.id, skipSideEffects: true })
    await expect(
      withFailingTransactionQueryOptionsForTest(
        'updateEntityRelationElectionVoteStatsFromPrimaryBatch',
        options => clearCategoriesForUnlinkedTopicAlias(alias!.id, topic.id, options),
      ),
    ).rejects.toThrow(
      'Injected query failure for updateEntityRelationElectionVoteStatsFromPrimaryBatch',
    )

    await expect(getRssFeedItemCategories(item!.id)).resolves.toContainEqual(
      expect.objectContaining({ category_text: categoryText, topic_id: topic.id }),
    )
    await expect(
      getEntityRelationElectionVote(categorizer!.id, relationId!),
    ).resolves.toMatchObject({
      choice: 'confirm',
    })

    await expect(clearCategoriesForUnlinkedTopicAlias(alias!.id, topic.id)).resolves.toEqual({
      updated: 1,
    })
    await expect(getEntityRelationElectionVote(categorizer!.id, relationId!)).resolves.toBeNull()
  })

  it('retracts only the categorizer vote while preserving an independent topic vote', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const [topic, voter] = await Promise.all([
      createTestTopic({
        name: `RSS category vote ${suffix}`,
        slug: `rss-category-vote-${suffix}`,
      }),
      createTestUser(),
    ])
    const [alias] = await createTopicAliases(topic.id, `rss-category-vote-alias-${suffix}`)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://rss-category-vote-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `RSS category vote ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://rss-category-vote-${suffix}.example.com/item`,
        guid: `rss-category-vote-${suffix}`,
        title: `RSS category vote ${suffix}`,
      },
    ])
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [`#${alias!.alias}`] },
    ])
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const [relation] = await upsertEntityRelation(
      voter!,
      relationMetadata,
      { id: item!.id },
      [{ id: topic.id }],
      { vote: true },
    )
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    expect(categorizer).not.toBeNull()

    await unlinkTopicAlias(alias!.id, { expectedTopicId: topic.id, skipSideEffects: true })
    await clearCategoriesForUnlinkedTopicAlias(alias!.id, topic.id)

    await expect(
      getEntityRelation(relationMetadata.table_name, item!.id, topic.id),
    ).resolves.toEqual([expect.objectContaining({ deleted_at: null })])
    await expect(getEntityRelationElectionVote(voter!.id, relation!.id!)).resolves.toMatchObject({
      choice: 'confirm',
    })
    await expect(getEntityRelationElectionVote(categorizer!.id, relation!.id!)).resolves.toBeNull()
  })

  it('preserves collaborative-topic support while retracting alias-derived support', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const topic = await createTestTopic({
      name: `RSS collaborative category ${suffix}`,
      slug: `rss-collaborative-category-${suffix}`,
    })
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://rss-collaborative-category-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `RSS collaborative category ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://rss-collaborative-category-${suffix}.example.com/item`,
        guid: `rss-collaborative-category-${suffix}`,
        title: `RSS collaborative category ${suffix}`,
      },
    ])
    const [alias] = await createTopicAliases(topic.id, `rss-collaborative-alias-${suffix}`)
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: item!.id, categories: [`#${alias!.alias}`] },
    ])
    const follower = await createTestUser()
    await Promise.all([
      createTestMembership({ user_id: follower!.id, plan: 'plus' }),
      insertEntityRelation('relation__user__follow__rss_feed', follower!.id, feed.id),
      followTopicById(follower!.id, topic.id),
    ])
    const [relation] = await applyCollaborativeTopicRelations(item!.id, {
      plusLimit: 1,
      proLimit: 0,
    })
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    const collaborativeCategorizer = await getSystemUserByUsername(
      RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME,
    )
    expect(categorizer).not.toBeNull()
    expect(collaborativeCategorizer).not.toBeNull()

    await unlinkTopicAlias(alias!.id, { expectedTopicId: topic.id, skipSideEffects: true })
    await clearCategoriesForUnlinkedTopicAlias(alias!.id, topic.id)

    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    await expect(
      getEntityRelation(relationMetadata.table_name, item!.id, topic.id),
    ).resolves.toEqual([expect.objectContaining({ deleted_at: null })])
    await expect(
      getEntityRelationElectionVote(collaborativeCategorizer!.id, relation!.id!),
    ).resolves.toMatchObject({ choice: 'confirm' })
    await expect(getEntityRelationElectionVote(categorizer!.id, relation!.id!)).resolves.toBeNull()
  })

  it('rechecks restored mappings after serializing categorizer vote changes', async () => {
    const suffix = Math.random().toString(36).slice(2, 12)
    const topic = await createTestTopic({
      name: `RSS category recheck ${suffix}`,
      slug: `rss-category-recheck-${suffix}`,
    })
    const [alias] = await createTopicAliases(topic.id, `rss-category-recheck-alias-${suffix}`)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://rss-category-recheck-${suffix}.example.com/feed.xml`,
      topicId: topic.id,
      title: `RSS category recheck ${suffix}`,
    })
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        link: `https://rss-category-recheck-${suffix}.example.com/item`,
        guid: `rss-category-recheck-${suffix}`,
        title: `RSS category recheck ${suffix}`,
      },
    ])
    const categoryText = `#${alias!.alias}`
    await upsertRssFeedItemCategories([{ rss_feed_item_id: item!.id, categories: [categoryText] }])
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'rss_feed_item',
      objectType: 'topic',
      predicate: 'category',
    })
    const [relation] = await getEntityRelation(relationMetadata.table_name, item!.id, topic.id)
    const relationId = (relation as { id?: string } | undefined)?.id
    const categorizer = await getSystemUserByUsername(RSS_FEED_CATEGORIZER_USERNAME)
    expect(categorizer).not.toBeNull()
    expect(relationId).toBeDefined()
    await expect(
      getEntityRelationElectionVote(categorizer!.id, relationId!),
    ).resolves.toMatchObject({ choice: 'confirm' })
    await setTestRssFeedItemCategoryTopicId(item!.id, categoryText, null)

    const holder = await holdTestEntityRelationVoteLock(categorizer!.id, relationId!)

    const cleanup = clearCategorizerVotesForUnreferencedCategoryTopicRelations([
      { rss_feed_item_id: item!.id, topic_id: topic.id },
    ])
    await expect.poll(testCategorizerVoteLockHasWaiter).toBe(true)
    await setTestRssFeedItemCategoryTopicId(item!.id, categoryText, topic.id)
    await holder.release()
    await cleanup

    await expect(
      getEntityRelationElectionVote(categorizer!.id, relationId!),
    ).resolves.toMatchObject({ choice: 'confirm' })
  })
})
