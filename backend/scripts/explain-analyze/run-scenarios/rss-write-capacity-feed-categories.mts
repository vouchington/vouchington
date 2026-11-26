import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { registerRssCategoryIdentities } from '@services/rss-feed-items/category-identities'
import {
  deleteRssFeedCategories,
  getRssFeedCategories,
  upsertRssFeedCategories,
} from '@services/rss-feeds/categories'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  rssWriteFeedCategoryCapacity,
  type RssWriteCapacityFixture,
} from './rss-write-capacity-fixture.mts'

export async function runRssFeedCategoryWriteScenario(fixture: RssWriteCapacityFixture) {
  const scenario = 'rss-feed-category-upsert-at-cap'
  const marker = 'upsertRssFeedCategories'
  const categories = Array.from(
    { length: rssWriteFeedCategoryCapacity },
    (_, index) => `${fixture.prefix}f${String(index).padStart(2, '0')}`,
  )
  const mappedCategories = categories.filter((_, index) => index % 2 === 0)
  const mapped = new Set(mappedCategories)
  const existing = [...categories.slice(0, categories.length / 2), `${fixture.prefix}obsolete`]
  await registerRssCategoryIdentities([...categories, existing.at(-1)!], write)
  await write(
    `/* seedRssWriteCapacityFeedCategoryAliases */
     INSERT INTO topic_aliases (alias, topic_id)
     SELECT alias, $2::uuid FROM unnest($1::text[]) AS input(alias)`,
    [mappedCategories, fixture.topicId],
  )
  await seedFeedCategoryBackground(categories)
  await restoreFeedCategoryBaseline(fixture.feedId, existing)

  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxInputRows', nodeType: 'Sort', max: categories.length },
      { kind: 'maxInputRows', nodeType: 'Function Scan', max: categories.length },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      await upsertRssFeedCategories(fixture.feedId, categories)
      assert.deepEqual(
        await getRssFeedCategories(fixture.feedId),
        categories.map(category_text => ({
          category_text,
          topic_id: mapped.has(category_text) ? fixture.topicId : null,
        })),
      )
    },
    undefined,
    marker,
    {
      exactCapturedNames: [
        'registerRssCategoryIdentities',
        'resolveRssFeedCategoryTopics',
        'upsertRssFeedCategories:lockFeed',
        'upsertRssFeedCategories:lockExisting',
        'resolveRssFeedCategoryTopics',
        marker,
        'upsertRssFeedCategories:deleteRemoved',
        'getRssFeedCategories',
      ],
      afterCapture: () => restoreFeedCategoryBaseline(fixture.feedId, existing),
    },
  )
  await captureFeedCategoryReadAndDelete(fixture, categories, mapped)
}

async function captureFeedCategoryReadAndDelete(
  fixture: RssWriteCapacityFixture,
  categories: string[],
  mapped: ReadonlySet<string>,
): Promise<void> {
  await upsertRssFeedCategories(fixture.feedId, categories)
  const expected = categories.map(category_text => ({
    category_text,
    topic_id: mapped.has(category_text) ? fixture.topicId : null,
  }))
  const readScenario = 'rss-feed-category-read-at-cap'
  registerScenarioContract(readScenario, { expectations: [] })
  await runAndCapture(
    readScenario,
    async () => assert.deepEqual(await getRssFeedCategories(fixture.feedId), expected),
    undefined,
    'getRssFeedCategories',
  )
  const otherFeedId = seedUuid(0, '08')
  const unrelated = await getRssFeedCategories(otherFeedId)
  assert.ok(unrelated.some(row => row.category_text === categories[0]))
  const deleteScenario = 'rss-feed-category-delete-at-cap'
  registerScenarioContract(deleteScenario, { allowEmptyResult: true, expectations: [] })
  await runAndCapture(
    deleteScenario,
    async () => {
      await deleteRssFeedCategories(fixture.feedId)
      assert.deepEqual(await getRssFeedCategories(fixture.feedId), [])
      assert.deepEqual(await getRssFeedCategories(otherFeedId), unrelated)
    },
    undefined,
    'deleteRssFeedCategories',
    { afterCapture: () => upsertRssFeedCategories(fixture.feedId, categories) },
  )
}

// The real service commits. Restore its original unmapped rows once before the plan
// passes; each EXPLAIN executes and rolls back independently from that same baseline.
async function restoreFeedCategoryBaseline(feedId: string, existing: string[]) {
  await using query = await beginTransaction()
  await query(
    '/* clearRssWriteCapacityFeedCategories */ DELETE FROM rss_feed_categories WHERE rss_feed_id = $1',
    [feedId],
  )
  await query(
    `/* restoreRssWriteCapacityFeedCategories */
     INSERT INTO rss_feed_categories (rss_feed_id, category_identity_id)
     SELECT $1, id FROM rss_category_identities WHERE category_text = ANY($2::text[])`,
    [feedId, existing],
  )
  await query.commit()
}

// These unrelated pairs use the same category labels on 100 other feeds.
async function seedFeedCategoryBackground(categories: string[]): Promise<void> {
  const feedIds = Array.from({ length: 100 }, (_, index) => seedUuid(index, '08'))
  const result = await write(
    `/* seedRssWriteCapacityFeedCategoryBackground */
     INSERT INTO rss_feed_categories (rss_feed_id, category_identity_id)
     SELECT feed.id, identity.id
     FROM rss_feeds feed
     CROSS JOIN rss_category_identities identity
     WHERE feed.id = ANY($1::uuid[]) AND identity.category_text = ANY($2::text[])`,
    [feedIds, categories],
  )
  assert.equal(result.rowCount, feedIds.length * categories.length)
}
