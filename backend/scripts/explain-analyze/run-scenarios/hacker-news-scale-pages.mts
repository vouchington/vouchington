import assert from 'node:assert/strict'
import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import { buildPostSearchTimeRangeFilter } from '@services/posts/search/hacker-news-hot-options'
import { buildStablePostHotRankExpression } from '@services/posts/search/stable-hot-rank'
import type { PostSearchOptions } from '@services/posts/search/types'
import type { HackerNewsScaleFixture } from '../seed-data/hacker-news-scale-fixture.mts'
import type { HackerNewsScaleShape } from '../seed-data/hacker-news-scale-shapes.mts'

export type HackerNewsScaleRow = { id: string; vote_score?: number; hot_score?: number }
export type HackerNewsScalePage = {
  name: 'first' | 'continuation'
  options: PostSearchOptions
  expectedIds: string[]
}

/** Read only known matching identities to establish independent expected page membership/order. */
export async function hackerNewsScalePages(
  fixture: HackerNewsScaleFixture,
  shape: HackerNewsScaleShape,
  sort: 'new' | 'best' | 'hot',
  timeRange: '1y' | 'all',
): Promise<HackerNewsScalePage[]> {
  const query = sql`/* hackerNewsScaleExpectedRanks */
    SELECT posts.id, posts.votes_score_sort AS vote_score, `
    .append(buildStablePostHotRankExpression())
    .append(
      sql` AS hot_score FROM posts WHERE posts.id = ANY(${[
        ...fixture.matchingPostIds,
        fixture.heavyPostId,
      ]}::uuid[]) LIMIT 1002`,
    )
  const { rows } = await read<HackerNewsScaleRow>(query)
  assert.equal(rows.length, 1001)
  const common = { has_hacker_news_references: true, time_range: timeRange, limit: 26 }
  const options: PostSearchOptions = { ...common, sort }
  const lower = buildPostSearchTimeRangeFilter(options, 'posts.id', fixture.decisionInstant)
    ?.values[0]
  assert(lower === undefined || typeof lower === 'string')
  const matches = new Set(fixture.matchingPostIds)
  const expected =
    shape === 'zero'
      ? []
      : rows.filter(row => matches.has(row.id) && (lower === undefined || row.id >= lower))
  expected.sort((a, b) => {
    const rank =
      sort === 'new'
        ? 0
        : sort === 'best'
          ? Number(b.vote_score) - Number(a.vote_score)
          : Number(b.hot_score) - Number(a.hot_score)
    return rank || b.id.localeCompare(a.id)
  })
  const cursor = expected[24] ?? rows.find(row => row.id === fixture.heavyPostId)
  assert(cursor, 'The empty probe still needs an owned continuation boundary')
  const continuation: PostSearchOptions =
    sort === 'best'
      ? { ...common, sort: 'best', id_lt: cursor.id, vote_score_lt: Number(cursor.vote_score) }
      : sort === 'hot'
        ? { ...common, sort: 'hot', id_lt: cursor.id, hot_score_lt: Number(cursor.hot_score) }
        : { ...common, sort: 'new', id_lt: cursor.id }
  return [
    { name: 'first', options, expectedIds: expected.slice(0, 26).map(row => row.id) },
    {
      name: 'continuation',
      options: continuation,
      expectedIds: expected.slice(25, 51).map(row => row.id),
    },
  ]
}
