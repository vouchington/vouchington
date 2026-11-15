import { beginTransaction } from '@data-stores/psql'
import {
  readAliasCategoryRawPage,
  type AliasCategoryPhase,
} from '@services/rss-feeds/topic-alias-category-raw-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

export async function runTopicAliasRawPageScenarios(aliasId: string): Promise<void> {
  await captureRawPhase(
    aliasId,
    'rss_item_categories',
    'readAliasCategoryRawPage authoredItems',
    'idx_rss_feed_item_categories__topic_alias_id',
  )
  await captureRawPhase(
    aliasId,
    'rss_item_text_categories',
    'readAliasCategoryRawPage textItems',
    'idx_rss_feed_item_categories__category_identity_id',
  )
  await captureRawPhase(
    aliasId,
    'rss_feed_text_categories',
    'readAliasCategoryRawPage textFeeds',
    'idx_rss_feed_categories__category_identity_id',
  )
}

async function captureRawPhase(
  aliasId: string,
  phase: Exclude<AliasCategoryPhase, 'completed'>,
  queryName: string,
  indexName: string,
): Promise<void> {
  // Seeded ids come from the wall clock while the seed clock pins Date to the anchor day, so a
  // start-time bound would precede every seeded row; bound the sweep explicitly instead.
  const emptyCursor = {
    sweep_upper_bound_item_id: MAX_UUID,
    sweep_upper_bound_feed_id: MAX_UUID,
    cursor_item_id: null,
    cursor_category_identity_id: null,
    cursor_feed_id: null,
  }
  const label = `topic-alias-raw-${phase}`
  registerScenarioContract(label, {
    expectations: [
      { kind: 'usesIndexes', indexes: [indexName] },
      {
        kind: 'maxProcessedRows',
        relation:
          phase === 'rss_feed_text_categories' ? 'rss_feed_categories' : 'rss_feed_item_categories',
        max: 150,
      },
    ],
    seededRows: { rss_feed_item_categories: 6_000, rss_feed_categories: 22_000 },
  })
  await runAndCapture(
    label,
    async () => {
      await using transaction = await beginTransaction()
      const page = await readAliasCategoryRawPage(
        transaction,
        aliasId,
        'seed-alias-0',
        { ...emptyCursor, phase },
        100,
      )
      if (page.rows.length !== 100 || !page.hasMore)
        throw new Error(`${label} needs a full raw page with continuation`)
      await transaction.commit()
      return page
    },
    undefined,
    queryName,
  )
}
