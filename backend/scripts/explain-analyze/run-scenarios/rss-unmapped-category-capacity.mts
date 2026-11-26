import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getUnmappedRssFeedItemCategories } from '@services/rss-feed-items/unmapped-categories'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runRssUnmappedCategoryCapacityScenario(): Promise<void> {
  const limit = 100
  const cohort = `explain-unmapped-${randomUUID()}`
  const ranked = Array.from(
    { length: 2 * limit + 2 },
    (_, index) => `${cohort}-ranked-${String(index).padStart(3, '0')}`,
  )
  const background = Array.from({ length: 5_000 }, (_, index) => `${cohort}-background-${index}`)
  const categories = [...ranked, ...background]
  try {
    await capturePendingCategories(limit, ranked, background, categories)
  } finally {
    const { rows } = await write<{ id: string }>(sql`/* readExplainUnmappedCategoryIdentities */
      SELECT id FROM rss_category_identities WHERE category_text = ANY(${categories}::text[])`)
    const ids = rows.map(row => row.id)
    await Promise.all([
      write(sql`/* cleanupExplainUnmappedCategoryCounts */
        DELETE FROM rss_feed_item_unmapped_category_counts WHERE category_identity_id = ANY(${ids}::uuid[])`),
      write(sql`/* cleanupExplainRejectedCategories */
        DELETE FROM rss_feed_item_category_rejections WHERE category_identity_id = ANY(${ids}::uuid[])`),
    ])
    await write(sql`/* cleanupExplainUnmappedCategoryIdentities */
      DELETE FROM rss_category_identities WHERE id = ANY(${ids}::uuid[])`)
  }
}

async function capturePendingCategories(
  limit: number,
  ranked: string[],
  background: string[],
  categories: string[],
): Promise<void> {
  await write(sql`/* seedExplainUnmappedCategoryCounts */
    WITH identities AS (
      INSERT INTO rss_category_identities (category_text)
      SELECT category_text FROM unnest(${categories}::text[]) AS source(category_text)
      RETURNING id, category_text
    )
    INSERT INTO rss_feed_item_unmapped_category_counts (category_identity_id, item_count)
    SELECT identity.id, CASE WHEN fixture.ordinal <= ${ranked.length}
      THEN 2000 ELSE 1 + fixture.ordinal % 25 END
    FROM identities identity
    JOIN unnest(${categories}::text[]) WITH ORDINALITY AS fixture(category_text, ordinal)
      USING (category_text)`)
  await write(sql`/* seedExplainRejectedCategories */
    INSERT INTO rss_feed_item_category_rejections (category_identity_id)
    SELECT id FROM rss_category_identities WHERE category_text = ANY(${[ranked[7]!, ...background.slice(0, 500)]}::text[])`)
  await write(
    '/* analyzeExplainUnmappedCategoryCounts */ ANALYZE rss_feed_item_unmapped_category_counts, rss_feed_item_category_rejections, rss_category_identities',
  )
  const {
    rows: [corpus],
  } = await write<{
    counts: number
    rejections: number
    identities: number
  }>(sql`/* countExplainUnmappedCategoryCorpus */
    SELECT (SELECT count(*)::int FROM rss_feed_item_unmapped_category_counts) AS counts,
      (SELECT count(*)::int FROM rss_feed_item_category_rejections) AS rejections,
      (SELECT count(*)::int FROM rss_category_identities) AS identities`)
  assert.ok(corpus)
  const scenario = 'rss-unmapped-categories-at-cap'
  registerScenarioContract(scenario, {
    seededRows: {
      rss_feed_item_unmapped_category_counts: corpus.counts,
      rss_feed_item_category_rejections: corpus.rejections,
      rss_category_identities: corpus.identities,
    },
    expectations: [
      // Current plans examine one full corpus per page. https://github.com/vouchington/vouchington/issues/6545
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_unmapped_category_counts',
        max: corpus.counts,
      },
    ],
  })
  const expected = ranked.filter((_, index) => index !== 7)
  await runAndCapture(
    scenario,
    async () => {
      const first = await getUnmappedRssFeedItemCategories({ status: 'pending', limit })
      assert.deepEqual(
        first.results.map(category => category.category_text),
        expected.slice(0, limit),
      )
      assert.equal(first.page_info.has_next_page, true)
      assert.ok(first.page_info.end_cursor)
      const second = await getUnmappedRssFeedItemCategories({
        status: 'pending',
        limit,
        after: first.page_info.end_cursor,
      })
      assert.deepEqual(
        second.results.map(category => category.category_text),
        expected.slice(limit, limit * 2),
      )
      assert.equal(second.page_info.has_next_page, true)
      assert.ok(second.page_info.end_cursor)
    },
    undefined,
    'getUnmappedRssFeedItemCategories',
  )
}
