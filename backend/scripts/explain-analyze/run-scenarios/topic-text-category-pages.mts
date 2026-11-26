import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import { getRssFeedsWorkLimit } from '@services/rss-feeds/work-limits'
import { readTopicTextCategoryRawPage } from '@services/rss-feeds/topic-text-category-raw-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { cleanupRssWriteCapacity, seedRssWriteCapacity } from './rss-write-capacity-fixture.mts'

type CategoryRelation = 'rss_feed_categories' | 'rss_feed_item_categories'

export async function runTopicTextCategoryPageScenarios(): Promise<void> {
  const fixture = await seedRssWriteCapacity()
  const name = `${fixture.prefix} canonical`
  try {
    await write('/* seedCanonicalRssCategoryTopic */ UPDATE topics SET name = $2 WHERE id = $1', [
      fixture.feedTopicId,
      name,
    ])
    const { rows } = await write<{ id: string; category_text: string }>(
      `/* seedCanonicalRssCategoryIdentity */ INSERT INTO rss_category_identities (category_text)
       VALUES ($1), ($2) RETURNING id, category_text`,
      [name, fixture.prefix],
    )
    const nameId = rows.find(row => row.category_text === name)!.id
    const slugId = rows.find(row => row.category_text === fixture.prefix)!.id
    await captureTopicTextPage(
      fixture.feedTopicId,
      'rss_feed_item_categories',
      name,
      nameId,
      slugId,
    )
    await captureTopicTextPage(fixture.feedTopicId, 'rss_feed_categories', name, nameId, slugId)
  } finally {
    await write(
      `/* cleanupCanonicalRssItemCategories */ DELETE FROM rss_feed_item_categories category
        USING rss_category_identities identity
        WHERE category.category_identity_id = identity.id AND identity.category_text = ANY($1::text[])`,
      [[name, fixture.prefix]],
    )
    await cleanupRssWriteCapacity(fixture)
  }
}

async function captureTopicTextPage(
  topicId: string,
  relation: CategoryRelation,
  name: string,
  nameId: string,
  slugId: string,
) {
  const itemPage = relation === 'rss_feed_item_categories'
  const key = itemPage ? 'rss_feed_item_id' : 'rss_feed_id'
  const source = itemPage ? 'rss_feed_items' : 'rss_feeds'
  const size = itemPage
    ? getRssFeedItemsWorkLimit('category_backfill_batch_size')
    : getRssFeedsWorkLimit('category_backfill_batch_size')
  const label = itemPage
    ? 'topic-text-item-category-page-at-cap'
    : 'topic-text-feed-category-page-at-cap'
  const insertColumns = itemPage
    ? `${key}, category_identity_id, category_text`
    : `${key}, category_identity_id`
  const insertValues = itemPage ? 'id, $1, $3' : 'id, $1'
  const { rows } = await write<{ content_id: string; category_identity_id: string }>(
    `/* seedCanonicalRssCategoryPage */ INSERT INTO ${relation} (${insertColumns})
      SELECT ${insertValues} FROM ${source} WHERE deleted_at IS NULL ORDER BY id LIMIT $2
      RETURNING ${key} AS content_id, category_identity_id`,
    itemPage ? [nameId, size + 1, name] : [nameId, size + 1],
  )
  const expected = rows.toSorted((a, b) => a.content_id.localeCompare(b.content_id))
  assert.equal(expected.length, size + 1)
  const slugValues = itemPage
    ? '$1, $2, (SELECT category_text FROM rss_category_identities WHERE id = $2)'
    : '$1, $2'
  await write(
    `/* seedCanonicalRssCategorySlug */ INSERT INTO ${relation} (${insertColumns}) VALUES (${slugValues})`,
    [expected[0]!.content_id, slugId],
  )
  registerScenarioContract(label, { expectations: [] })
  await runAndCapture(
    label,
    async () => {
      await using query = await beginTransaction()
      const page = await readTopicTextCategoryRawPage(query, topicId, relation, null, size)
      assert.deepEqual(page.rows, expected.slice(0, size))
      assert.equal(page.sourcePhase, 0)
      assert.equal(page.hasMore, true)
      assert.equal(page.cursor?.afterId, expected[size - 1]!.content_id)
      assert.ok(page.cursor)
      const tail = await readTopicTextCategoryRawPage(query, topicId, relation, page.cursor, size)
      assert.deepEqual(tail.rows, expected.slice(size))
      assert.equal(tail.cursor?.phase, 1)
      assert.ok(tail.cursor)
      const slug = await readTopicTextCategoryRawPage(query, topicId, relation, tail.cursor, size)
      assert.deepEqual(slug.rows, [
        { content_id: expected[0]!.content_id, category_identity_id: slugId },
      ])
      assert.equal(slug.hasMore, false)
    },
    undefined,
    'readTopicTextCategoryRawPage rows',
  )
}
