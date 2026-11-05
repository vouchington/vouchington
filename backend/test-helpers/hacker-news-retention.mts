import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { cleanupHackerNewsReferences } from '../services/data-retention/cleanup-hacker-news.mts'
import { createTestUrlWithHostname } from './entities/urls.mts'

/** All reference facts and cleanup passes share one rollback-only transaction. */
export async function createHackerNewsRetentionFixtureForTest() {
  const [expired, expiredZero, liveZero] = await Promise.all([
    createTestUrlWithHostname(),
    createTestUrlWithHostname(),
    createTestUrlWithHostname(),
  ])
  const ids = [expired!, expiredZero!, liveZero!]
  const query = await beginTransaction()
  try {
    await query(
      `/* createHackerNewsRetentionFixtureForTest */
      INSERT INTO url_hacker_news_totals (url_id, story_count, comment_count, looked_up_at)
      SELECT url_id, story_count, comment_count, looked_up_at
      FROM unnest($1::uuid[], $2::int[], $3::int[], $4::timestamptz[])
        AS facts(url_id, story_count, comment_count, looked_up_at)`,
      [
        ids,
        [1, 0, 0],
        [1, 0, 0],
        ['2026-06-29T00:00:00.000Z', '2026-06-30T00:00:00.000Z', '2026-07-01T00:00:00.000Z'],
      ],
    )
    await query(
      `/* createHackerNewsRetentionFixtureForTest */
      INSERT INTO url_hacker_news_stories
        (url_id, hacker_news_item_id, points, reply_count, posted_at)
      VALUES ($1, 1, 10, 2, $2)`,
      [expired, '2026-06-01T00:00:00.000Z'],
    )
    await query(
      `/* createHackerNewsRetentionFixtureForTest */
      INSERT INTO url_hacker_news_comments
        (url_id, hacker_news_item_id, parent_story_item_id, posted_at)
      VALUES ($1, 2, 1, $2)`,
      [expired, '2026-06-01T00:00:00.000Z'],
    )
  } catch (err) {
    await query[Symbol.asyncDispose]()
    throw err
  }
  return {
    expired: expired!,
    expiredZero: expiredZero!,
    liveZero: liveZero!,
    cleanup: () =>
      cleanupHackerNewsReferences({
        now: new Date('2026-07-31T00:00:00.000Z'),
        query,
        urlIds: ids,
      }),
    read: () => readHackerNewsRetentionFacts(query, ids),
    [Symbol.asyncDispose]: () => query[Symbol.asyncDispose](),
  }
}

async function readHackerNewsRetentionFacts(query: TransactionQuery, ids: readonly string[]) {
  const { rows } = await query<{
    url_id: string
    kind: string
    story_count: number
    comment_count: number
  }>(
    `/* readHackerNewsRetentionFacts */
    SELECT url_id, 'totals' AS kind, story_count, comment_count
    FROM url_hacker_news_totals WHERE url_id = ANY($1::uuid[])
    UNION ALL
    SELECT url_id, 'story', 0, 0
    FROM url_hacker_news_stories WHERE url_id = ANY($1::uuid[])
    UNION ALL
    SELECT url_id, 'comment', 0, 0
    FROM url_hacker_news_comments WHERE url_id = ANY($1::uuid[])`,
    [ids],
  )
  return {
    totals: Object.fromEntries(
      rows.flatMap(row =>
        row.kind === 'totals'
          ? [
              [
                row.url_id,
                {
                  story_count: row.story_count,
                  comment_count: row.comment_count,
                },
              ],
            ]
          : [],
      ),
    ),
    stories: rows.flatMap(row => (row.kind === 'story' ? [row.url_id] : [])),
    comments: rows.flatMap(row => (row.kind === 'comment' ? [row.url_id] : [])),
  }
}
