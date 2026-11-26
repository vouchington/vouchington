import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getAutotaggerPaidLimitsFields } from '@services/autotagger/limits-config'
import { getRssFeedItemMappedTopics } from '@services/rss-feed-items/category-relations'
import { RSS_FEED_ITEM_MAX_CATEGORIES } from '@services/rss-feed-items/processing-limits'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { cleanupRssWriteCapacity, seedRssWriteCapacity } from './rss-write-capacity-fixture.mts'

export async function runRssMappedTopicCapacity(): Promise<void> {
  const scenario = 'rss-mapped-topics-at-cap'
  const { rss_discoverable_llm_max_topics: limit } = getAutotaggerPaidLimitsFields()
  const fixture = await seedRssWriteCapacity()
  const mappedTopics = Array.from({ length: 12 }, (_, index) => seedUuid(500 + index, '04'))
  assert.ok(limit > 0 && limit <= mappedTopics.length)
  try {
    await write(sql`/* seedExplainRssMappedTopics */
      WITH identities AS (
        INSERT INTO rss_category_identities (category_text)
        SELECT ${fixture.prefix} || '-mapped-' || entry.n
        FROM generate_series(1, ${RSS_FEED_ITEM_MAX_CATEGORIES}::int) entry(n)
        RETURNING id, category_text
      ), mapped AS (
        SELECT topic.id, topic.ordinal
        FROM unnest(${mappedTopics}::uuid[]) WITH ORDINALITY AS topic(id, ordinal)
      )
      INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_identity_id, category_text, topic_id)
      SELECT item.id, identity.id, identity.category_text, mapped.id
      FROM unnest(${fixture.itemIds}::uuid[]) AS item(id)
      CROSS JOIN identities identity
      LEFT JOIN mapped ON mapped.ordinal = split_part(identity.category_text, '-', 3)::int`)
    await write('/* analyzeExplainRssMappedTopics */ ANALYZE rss_feed_item_categories')
    const {
      rows: [corpus],
    } = await write<{ topics: number; categories: number; topicPrefix: number }>(sql`
      /* countExplainRssMappedTopics */
      SELECT (SELECT count(*)::int FROM topics) AS topics,
        (SELECT count(*)::int FROM rss_feed_item_categories) AS categories,
        (SELECT count(*)::int FROM topics WHERE id <= ${mappedTopics[limit - 1]!}) AS "topicPrefix"`)
    assert.ok(corpus)
    registerScenarioContract(scenario, {
      seededRows: { topics: corpus.topics, rss_feed_item_categories: corpus.categories },
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'rss_feed_item_categories',
          max: RSS_FEED_ITEM_MAX_CATEGORIES,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'topics',
          // Current custom plan walks the primary key up to the last requested topic.
          // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7188117786
          max: Math.max(corpus.topicPrefix, mappedTopics.length),
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const topics = await getRssFeedItemMappedTopics(fixture.itemIds[0]!, limit)
        assert.deepEqual(
          topics.map(topic => topic.id),
          mappedTopics.slice(0, limit),
        )
      },
      undefined,
      'getRssFeedItemMappedTopics',
    )
  } finally {
    await cleanupRssWriteCapacity(fixture)
  }
}
