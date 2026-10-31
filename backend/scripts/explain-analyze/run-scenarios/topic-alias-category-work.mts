import { beginTransaction, write } from '@data-stores/psql'
import { runTopicAliasDirtyPageScenario } from './topic-alias-category-dirty-work.mts'
import { backfillLinkedAliasFeedPage } from '@services/rss-feeds/linked-alias-feed-page'
import { backfillCategoriesForTopicAliases } from '@services/rss-feed-items/backfill-categories-for-topic-aliases'
import { clearUnlinkedTopicAliasItemPage } from '@services/rss-feed-items/clear-unlinked-topic-alias-categories'
import { clearUnlinkedTopicAliasFeedPage } from '@services/rss-feed-items/clear-unlinked-topic-alias-feed-categories'
import { runTopicAliasRawPageScenarios } from './topic-alias-category-raw-work.mts'
import {
  rearmAliasFanIn,
  removeAliasFeedNoise,
  seedAliasFeedNoise,
} from './topic-alias-category-fixtures.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runTopicAliasCategoryWorkScenarios(): Promise<void> {
  await runTopicAliasDirtyPageScenario()
  const { rows: aliases } = await write<{ id: string }>(
    `/* findExplainTopicAlias */ SELECT id FROM topic_aliases WHERE alias = 'seed-alias-0' LIMIT 1`,
  )
  const aliasId = aliases[0]?.id
  if (!aliasId) throw new Error('EXPLAIN alias fan-in needs seed-alias-0')
  const { rows: identities } = await write<{ id: string }>(
    `/* seedExplainAliasCategoryIdentity */
     INSERT INTO rss_category_identities (category_text)
     VALUES ('seed-alias-0') ON CONFLICT (category_text)
     DO UPDATE SET category_text = EXCLUDED.category_text RETURNING id`,
  )
  const identityId = identities[0]!.id
  let feedNoiseIds: string[] = []
  try {
    await write(
      `/* seedExplainAliasItemFanIn */
       INSERT INTO rss_feed_item_categories
         (rss_feed_item_id, category_identity_id, category_text, topic_alias_id)
       SELECT id, $1::uuid, 'seed-alias-0', $2::uuid
       FROM rss_feed_item_guids WHERE guid LIKE 'seed-item-guid-%'
       ORDER BY id LIMIT 1000 ON CONFLICT DO NOTHING`,
      [identityId, aliasId],
    )
    await write(
      `/* seedExplainAliasFeedFanIn */
       INSERT INTO rss_feed_categories (rss_feed_id, category_identity_id)
       SELECT id, $1::uuid FROM rss_feeds ORDER BY id LIMIT 1000
       ON CONFLICT DO NOTHING`,
      [identityId],
    )
    feedNoiseIds = await seedAliasFeedNoise()
    await write(`/* seedExplainAliasFanIn:analyzeItems */ ANALYZE rss_feed_item_categories`)
    await write(`/* seedExplainAliasFanIn:analyzeFeeds */ ANALYZE rss_feed_categories`)
    await write(`/* seedExplainAliasFanIn:analyzeIdentities */ ANALYZE rss_category_identities`)
    const topicId = seedUuid(0, '04')
    const { rows: feedRows } = await write<{
      rss_feed_id: string
      category_identity_id: string
    }>(
      `/* selectExplainAliasFeedPage */
       SELECT rss_feed_id, category_identity_id FROM rss_feed_categories
       WHERE category_identity_id = $1::uuid ORDER BY rss_feed_id LIMIT 100`,
      [identityId],
    )
    const { rows: itemRows } = await write<{
      rss_feed_item_id: string
      category_identity_id: string
    }>(
      `/* selectExplainAliasItemPage */
       SELECT rss_feed_item_id, category_identity_id FROM rss_feed_item_categories
       WHERE category_identity_id = $1::uuid ORDER BY rss_feed_item_id LIMIT 100`,
      [identityId],
    )
    await runTopicAliasRawPageScenarios(aliasId)
    registerScenarioContract('topic-alias-feed-category-fan-in', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_rss_feed_categories__category_identity_id', 'rss_feed_categories_pkey'],
          anyOf: true,
        },
        { kind: 'maxProcessedRows', relation: 'rss_feed_categories', max: 1_100 },
      ],
      seededRows: { rss_feed_categories: 22_000, topic_aliases: 2_800 },
    })
    await runAndCapture(
      'topic-alias-feed-category-fan-in',
      () => backfillLinkedAliasFeedPage(aliasId, 'seed-alias-0', topicId, feedRows),
      undefined,
      'backfillLinkedAliasFeedPage candidates',
      {
        afterCapture: async () => {
          await rearmAliasFanIn(identityId, 'rss_feed_categories')
        },
      },
    )
    registerScenarioContract('topic-alias-item-category-fan-in', {
      expectations: [{ kind: 'maxProcessedRows', relation: 'rss_feed_item_categories', max: 350 }],
      seededRows: { rss_feed_item_categories: 6_000, topic_aliases: 2_800 },
    })
    await runAndCapture(
      'topic-alias-item-category-fan-in',
      () =>
        backfillCategoriesForTopicAliases(topicId, {
          rows: itemRows,
          hasMore: true,
          match: { kind: 'alias_text', aliasId, alias: 'seed-alias-0' },
        }),
      undefined,
      ['backfillCategoriesForTopicAliases rawCandidates', 'backfillCategoriesForTopicAliases'],
      {
        afterCapture: async () => {
          await rearmAliasFanIn(identityId, 'rss_feed_item_categories')
        },
      },
    )
    await write(
      `/* unlinkExplainAliasFanIn */ UPDATE topic_aliases SET topic_id = NULL WHERE id = $1`,
      [aliasId],
    )
    await write(
      `/* seedExplainUnlinkedAliasFeeds */ UPDATE rss_feed_categories SET topic_id = $2
      WHERE category_identity_id = $1`,
      [identityId, topicId],
    )
    await write(
      `/* seedExplainUnlinkedAliasItems */ UPDATE rss_feed_item_categories SET topic_id = $2
      WHERE category_identity_id = $1`,
      [identityId, topicId],
    )
    await write(`/* seedExplainUnlinkedAlias:analyze */
      ANALYZE topic_aliases, rss_category_identities,
        rss_feed_categories, rss_feed_item_categories`)
    registerScenarioContract('topic-alias-unlinked-category-fan-in', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_categories', max: 1_100 },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_categories', max: 6_500 },
      ],
      seededRows: {
        rss_feed_categories: 22_000,
        rss_feed_item_categories: 6_000,
        topic_aliases: 2_800,
      },
    })
    await runAndCapture(
      'topic-alias-unlinked-category-fan-in',
      async () => {
        await using transaction = await beginTransaction()
        const feedUpdated = await clearUnlinkedTopicAliasFeedPage(
          transaction,
          aliasId,
          'seed-alias-0',
          feedRows,
        )
        await transaction.commit()
        const item = await clearUnlinkedTopicAliasItemPage(aliasId, 'seed-alias-0', {
          rows: itemRows,
          hasMore: true,
          match: 'alias_text',
        })
        if (feedUpdated !== 100 || item.updated !== 100)
          throw new Error('Unlinked alias fan-in needs 100 feed and item updates')
        return item
      },
      undefined,
      [
        'clearUnlinkedTopicAliasFeedPage candidates',
        'clearCategoriesForUnlinkedTopicAlias.rawCandidates',
      ],
      {
        afterCapture: async () => {
          await write(
            `/* rearmExplainUnlinkedAliasFeeds */ UPDATE rss_feed_categories SET topic_id = $2
          WHERE category_identity_id = $1`,
            [identityId, topicId],
          )
          await write(
            `/* rearmExplainUnlinkedAliasItems */ UPDATE rss_feed_item_categories SET topic_id = $2
          WHERE category_identity_id = $1`,
            [identityId, topicId],
          )
        },
      },
    )
  } finally {
    await removeAliasFeedNoise(feedNoiseIds)
    await write(
      `/* relinkExplainAliasFanIn */ UPDATE topic_aliases SET topic_id = $2 WHERE id = $1`,
      [aliasId, seedUuid(0, '04')],
    )
    await write(
      `/* seedExplainAliasFanIn:removeItems */
       DELETE FROM rss_feed_item_categories WHERE category_identity_id = $1::uuid`,
      [identityId],
    )
    await write(
      `/* seedExplainAliasFanIn:removeFeeds */
       DELETE FROM rss_feed_categories WHERE category_identity_id = $1::uuid`,
      [identityId],
    )
  }
}
