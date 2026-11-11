import { runHackerNewsReadmissionScenarios } from './hacker-news-readmission.mts'
import { beginTransaction, read } from '@data-stores/psql'
import { buildHackerNewsPostUrlsSql } from '@services/urls/hacker-news-post-urls'
import { buildPostSearchQuery } from '@services/posts/search/query-builder'
import { postsWorkConfig } from '@services/posts/work-limits'
import { partitionIndexLeaves } from '../partition-index-leaves.mts'
import { searchRssFeedItems } from '@services/rss-feed-items/search'
import { getRssFeedItemFeedIds } from '@services/feeds'
import { getPrivateUserByIdOrSlug } from '@services/users'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import {
  seedHackerNewsFilterFixture,
  setHackerNewsFilterDensity,
  type HackerNewsFilterFixture,
} from '../seed-data/hacker-news-filter.mts'
import {
  verifyHackerNewsFilterFixtureTruth,
  cleanupHackerNewsFilterFixture,
} from '../seed-data/hacker-news-filter-checks.mts'

const POST_COUNT = 20_000
const RSS_COUNT = 5_000
// Earlier dispatch-work and story-projection scenarios create posts outside the seed ledger;
// reserve 16 for those bounded runtime fixtures (the observed corpus adds two).
const POST_SEED_BOUND = SEEDED_ROWS_BY_RELATION.posts! + POST_COUNT + 16
const RSS_SEED_BOUND = SEEDED_ROWS_BY_RELATION.rss_feed_items! + RSS_COUNT

/** Real flag-filter plans for anonymous, signed-in and admin search, plus feed windows. */
export async function runHackerNewsFilterScenarios(): Promise<void> {
  let fixture: HackerNewsFilterFixture | undefined
  try {
    await using seed = await beginTransaction()
    fixture = await seedHackerNewsFilterFixture(seed, {
      postCount: POST_COUNT,
      rssCount: RSS_COUNT,
    })
    await seed.commit()
    await postsWorkConfig.waitForInitialization()
    const hackerNewsHotLeaves = await partitionIndexLeaves(
      'idx_posts__hacker_news_references__stable_hot_rank__id',
    )
    const user = await getPrivateUserByIdOrSlug(fixture.actorId)
    if (!user) throw new Error('Hacker News feed fixture user is missing')
    for (const density of ['low', 'high'] as const) {
      await using update = await beginTransaction()
      // no-mistakes-disable-next-line query-reached-per-item: two fixed density states each seed bounded fixture batches before independent plan captures.
      await setHackerNewsFilterDensity(update, fixture, density === 'high')
      // no-mistakes-disable-next-line query-reached-per-item: each fixed density validates its own transaction snapshot through capped post batches.
      await verifyHackerNewsFilterFixtureTruth(update, fixture, buildHackerNewsPostUrlsSql)
      // no-mistakes-disable-next-line query-reached-per-item: each of two fixed density states needs statistics refreshed before its independent plans.
      await update(
        '/* analyzeHackerNewsFilterFixture */ ANALYZE posts,rss_feed_items,url_hacker_news_totals,relation__post__related__url',
      )
      await update.commit()
      const viewers = [
        { suffix: '', user: undefined },
        { suffix: '-member', user },
        { suffix: '-admin', user: { ...user, roles: ['administrator'] } },
      ]
      for (const viewer of viewers) {
        for (const sort of ['new', 'best', 'hot'] as const) {
          for (const timeRange of ['1m', '1y', 'all'] as const) {
            const id = `hacker-news-posts-${sort}-${timeRange}-${density}${viewer.suffix}`
            const boundedHot = sort === 'hot'
            registerScenarioContract(id, {
              seededRows: { posts: POST_SEED_BOUND, rss_feed_items: RSS_SEED_BOUND },
              expectations: [
                { kind: 'queryBinds', token: 'posts.has_hacker_news_references' },
                ...(boundedHot
                  ? [{ kind: 'queryBinds' as const, token: 'hackerNewsHotWindow' }]
                  : []),
                ...(boundedHot
                  ? [
                      {
                        kind: 'usesIndexes' as const,
                        indexes: hackerNewsHotLeaves,
                        anyOf: true,
                      },
                    ]
                  : []),
                {
                  kind: 'maxProcessedRows',
                  relation: 'posts',
                  // The hot walk stops on the stable-rank index; other sorts use the id or score index.
                  max: 2000,
                },
              ],
              allowEmptyResult: true,
              crossPartition: {
                posts: 'HN searches may span UUIDv7 post ranges within the selected window.',
              },
            })
            // no-mistakes-disable-next-line query-reached-per-item: the fixed sort/window/density matrix requires independent plans and serial process-global query capture.
            await runAndCapture(id, () =>
              read(
                buildPostSearchQuery(viewer.user, {
                  has_hacker_news_references: true,
                  time_range: timeRange,
                  sort,
                  limit: 26,
                }),
              ),
            )
          }
        }
      }
      const id = `hacker-news-rss-new-all-${density}`
      registerScenarioContract(id, {
        seededRows: { posts: POST_SEED_BOUND, rss_feed_items: RSS_SEED_BOUND },
        expectations: [
          { kind: 'queryBinds', token: 'rss_feed_items.has_hacker_news_references' },
          { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: RSS_COUNT * 3 },
        ],
        allowEmptyResult: true,
        crossPartition: {
          rss_feed_items: 'Production RSS search orders published dates across item ID ranges.',
        },
      })
      // no-mistakes-disable-next-line query-reached-per-item: the fixed sort/window/density matrix requires independent plans and serial process-global query capture.
      await runAndCapture(id, () =>
        searchRssFeedItems({ has_hacker_news_references: true, limit: 25 }),
      )
      for (const timeRange of ['1m', '1y', 'all'] as const) {
        const feedId = `hacker-news-rss-feed-new-${timeRange}-${density}`
        registerScenarioContract(feedId, {
          seededRows: { posts: POST_SEED_BOUND, rss_feed_items: RSS_SEED_BOUND },
          expectations: [
            { kind: 'queryBinds', token: 'rss_feed_items.has_hacker_news_references' },
            { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: RSS_SEED_BOUND * 4 },
          ],
          allowEmptyResult: true,
          crossPartition: {
            rss_feed_items: 'Personalized RSS windows rank eligible followed-source deliveries.',
          },
        })
        // no-mistakes-disable-next-line query-reached-per-item: each fixed window and density captures the actual bounded feed query independently.
        await runAndCapture(feedId, () =>
          getRssFeedItemFeedIds(user, {
            feed_type: 'follow_rss_feeds',
            has_hacker_news_references: true,
            time_range: timeRange,
            limit: 25,
          }),
        )
      }
    }
    await runHackerNewsReadmissionScenarios()
  } finally {
    if (fixture) {
      await using cleanup = await beginTransaction()
      await cleanupHackerNewsFilterFixture(cleanup, fixture)
      await cleanup.commit()
    }
  }
}
