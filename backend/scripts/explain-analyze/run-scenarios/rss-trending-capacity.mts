import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { searchRssFeeds } from '@services/rss-feeds/search'
import { buildRssFeedsPage, decodeRssFeedsCursor } from '@services/rss-feeds/search-page'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runRssTrendingCapacity(): Promise<void> {
  const limit = 25 // Public feed search route, which peeks one additional row.
  const sort = 'trending' as const
  const timeRange = 'week' as const
  const { rows: expected } = await read<{ id: string; score: number }>(
    `/* readExplainTrendingRssReferenceRanking */
     SELECT ranking.id, ranking.trending_score AS score
     FROM mv_trending_rss_feeds ranking
     JOIN rss_feeds feed ON feed.id = ranking.id
     WHERE ranking.window_name = $1 AND feed.is_enabled AND feed.deleted_at IS NULL
     ORDER BY ranking.trending_score DESC, ranking.id DESC`,
    [timeRange],
  )
  assert.ok(expected.length >= 1_000)
  const firstEndCursor = await capturePage('rss-feed-search-trending-first-at-cap', 0)
  assert.ok(firstEndCursor)
  await capturePage('rss-feed-search-trending-next-at-cap', limit, firstEndCursor)
  const terminalStart = expected.length - 3
  await capturePage(
    'rss-feed-search-trending-terminal-at-cap',
    terminalStart,
    encodeCursor(expected[terminalStart - 1]!),
  )

  async function capturePage(id: string, start: number, after?: string) {
    let nextCursor: string | null = null
    const pageRows = expected.slice(start, start + limit + 1)
    registerScenarioContract(id, {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_mv_trending_rss_feeds__ranking'] },
        { kind: 'maxProcessedRows', relation: 'mv_trending_rss_feeds', max: limit + 1 },
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 3 * (limit + 1) },
      ],
    })
    await runAndCapture(
      id,
      async () => {
        const raw = await searchRssFeeds({
          sort,
          time_range: timeRange,
          limit: limit + 1,
          ...decodeRssFeedsCursor(after, sort),
        })
        assert.deepEqual(
          raw.map(row => ({ id: row.id, score: row.cursor_score })),
          pageRows,
        )
        const page = buildRssFeedsPage(raw, { limit, sort, hasTextSearch: false })
        const displayed = pageRows.slice(0, limit)
        assert.deepEqual(
          page.feeds.map(feed => feed.id),
          displayed.map(feed => feed.id),
        )
        const hasNextPage = pageRows.length > limit
        assert.equal(page.page_info.has_next_page, hasNextPage)
        const endCursor = page.page_info.end_cursor
        if (hasNextPage) {
          assert.ok(endCursor)
          const last = displayed.at(-1)!
          assert.deepEqual(decodeRssFeedsCursor(endCursor, sort), {
            cursorId: last.id,
            cursorScore: last.score,
          })
          nextCursor = endCursor
        } else {
          assert.equal(endCursor, null)
        }
      },
      undefined,
      'searchRssFeeds',
    )
    return nextCursor
  }
}
