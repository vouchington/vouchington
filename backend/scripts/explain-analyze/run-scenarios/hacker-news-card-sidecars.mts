import assert from 'node:assert/strict'
import { hackerNewsReferenceConfig } from '@services/urls/hacker-news-reference-limits'
import { HACKER_NEWS_RELATED_URLS_PER_POST_MAX } from '@services/urls/hacker-news-references-types'
import {
  getPostHackerNewsSummaries,
  getRssFeedItemHackerNewsSummaries,
} from '@services/urls/hacker-news-sidecars'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getCapturedQueries } from '@voucha/test-helpers/explain-analyze'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedHackerNewsCardSidecars } from '../seed-data/hacker-news-card-sidecars.mts'

// The post and RSS feed routes both accept a 100-card page. URL hydration chunks at 200 by default.
const PAGE_SIZE = 100
const URL_BATCH_SIZE = 200
const postScenario = 'hacker-news-post-card-sidecars-at-cap'
const rssScenario = 'hacker-news-rss-card-sidecars-at-cap'
const postUrlsMarker = 'getHackerNewsUrlIdsByPostIds'
const totalsMarker = 'getHackerNewsTotalsByUrlIds'
const itemsMarker = 'getHackerNewsItemsByUrlIds'

function chunkSizes(count: number): number[] {
  return Array.from({ length: Math.ceil(count / URL_BATCH_SIZE) }, (_, index) =>
    Math.min(URL_BATCH_SIZE, count - index * URL_BATCH_SIZE),
  )
}

function assertCapturedBatchSizes(expected: readonly number[]): void {
  const sizes = getCapturedQueries().map(({ values: [ids] }) => {
    assert(Array.isArray(ids))
    return ids.length
  })
  assert.deepEqual(sizes, expected)
}

export async function runHackerNewsCardSidecarScenarios(): Promise<void> {
  await Promise.all([
    hackerNewsReferenceConfig.waitForInitialization(),
    hackerNewsVisibilityConfig.waitForInitialization(),
  ])
  const fixture = await seedHackerNewsCardSidecars(PAGE_SIZE)
  const restoreReferences = overrideDynamicConfigFieldsForTest(hackerNewsReferenceConfig, {
    url_batch_size: URL_BATCH_SIZE,
    stories_per_url: 25,
    comments_per_url: 25,
  })
  const restoreVisibility = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
    references_visible: true,
  })
  try {
    assert.equal(fixture.postIds.length, PAGE_SIZE)
    assert.equal(fixture.rssItems.length, PAGE_SIZE)
    registerScenarioContract(postScenario, {
      seededRows: fixture.seededRows,
      expectations: [
        { kind: 'maxInputRows', nodeType: 'Function Scan', max: URL_BATCH_SIZE },
        { kind: 'queryBinds', token: 'LIMIT', queryContains: itemsMarker },
      ],
    })
    const totalsSizes = chunkSizes(PAGE_SIZE * (1 + HACKER_NEWS_RELATED_URLS_PER_POST_MAX))
    const itemSizes = chunkSizes(fixture.postItemUrlCount)
    const postQueries = [
      postUrlsMarker,
      ...totalsSizes.map(() => totalsMarker),
      ...itemSizes.map(() => itemsMarker),
    ]
    await runAndCapture(
      postScenario,
      async () => {
        assert.deepEqual(
          await getPostHackerNewsSummaries(fixture.postIds),
          fixture.expectedPostSummaries,
        )
        assertCapturedBatchSizes([PAGE_SIZE, ...totalsSizes, ...itemSizes])
      },
      undefined,
      [postUrlsMarker, totalsMarker, itemsMarker],
      { exactCapturedNames: postQueries },
    )

    registerScenarioContract(rssScenario, {
      seededRows: fixture.seededRows,
      expectations: [{ kind: 'queryBinds', token: 'ANY' }],
    })
    await runAndCapture(
      rssScenario,
      async () => {
        assert.deepEqual(
          await getRssFeedItemHackerNewsSummaries(fixture.rssItems),
          fixture.expectedRssSummaries,
        )
        assertCapturedBatchSizes([PAGE_SIZE])
      },
      undefined,
      totalsMarker,
      { exactCapturedNames: [totalsMarker] },
    )
  } finally {
    restoreVisibility()
    restoreReferences()
    await fixture.cleanup()
  }
}
