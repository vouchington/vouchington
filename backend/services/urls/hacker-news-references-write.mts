import { beginTransaction, withTransactionOptions, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import createError from 'http-errors'
import {
  HACKER_NEWS_COMMENT_CAP_PER_URL,
  HACKER_NEWS_STORY_CAP_PER_URL,
  HACKER_NEWS_URL_BATCH_MAX,
  type HackerNewsCommentReference,
  type HackerNewsStoryReference,
} from './hacker-news-references-types.mts'

export type HackerNewsLookupResult = {
  url_id: string
  /** Total stories Hacker News search reported, which may exceed the stored rows. */
  story_count: number
  /** Total comments Hacker News search reported, which may exceed the stored rows. */
  comment_count: number
  stories: readonly HackerNewsStoryReference[]
  comments: readonly HackerNewsCommentReference[]
}

function capStories(stories: readonly HackerNewsStoryReference[]) {
  return stories
    .toSorted((a, b) => b.points - a.points || b.hacker_news_item_id - a.hacker_news_item_id)
    .slice(0, HACKER_NEWS_STORY_CAP_PER_URL)
}

function capComments(comments: readonly HackerNewsCommentReference[]) {
  return comments
    .toSorted(
      (a, b) =>
        b.posted_at.localeCompare(a.posted_at) || b.hacker_news_item_id - a.hacker_news_item_id,
    )
    .slice(0, HACKER_NEWS_COMMENT_CAP_PER_URL)
}

async function replaceInTransaction(
  results: readonly HackerNewsLookupResult[],
  query: TransactionQuery,
): Promise<void> {
  const urlIds = results.map(result => result.url_id)
  const stories = results.flatMap(result =>
    capStories(result.stories).map(story => ({ url_id: result.url_id, ...story })),
  )
  const comments = results.flatMap(result =>
    capComments(result.comments).map(comment => ({ url_id: result.url_id, ...comment })),
  )
  const options: QueryOptions = { query }

  await write(
    `/* replaceHackerNewsTotals */
    INSERT INTO url_hacker_news_totals (url_id, story_count, comment_count, looked_up_at)
    SELECT t.url_id, t.story_count, t.comment_count, CURRENT_TIMESTAMP
    FROM unnest($1::uuid[], $2::int[], $3::int[]) AS t(url_id, story_count, comment_count)
    ORDER BY t.url_id ASC NULLS LAST
    ON CONFLICT (url_id) DO UPDATE SET
      story_count = EXCLUDED.story_count,
      comment_count = EXCLUDED.comment_count,
      looked_up_at = EXCLUDED.looked_up_at
  `,
    [urlIds, results.map(r => r.story_count), results.map(r => r.comment_count)],
    options,
  )
  await write(
    `/* replaceHackerNewsStories */
    WITH removed AS (
      DELETE FROM url_hacker_news_stories WHERE url_id = ANY($1::uuid[])
    )
    INSERT INTO url_hacker_news_stories
      (url_id, hacker_news_item_id, points, reply_count, posted_at)
    SELECT s.url_id, s.hacker_news_item_id, s.points, s.reply_count, s.posted_at
    FROM unnest($2::uuid[], $3::bigint[], $4::int[], $5::int[], $6::timestamptz[])
      AS s(url_id, hacker_news_item_id, points, reply_count, posted_at)
  `,
    [
      urlIds,
      stories.map(s => s.url_id),
      stories.map(s => s.hacker_news_item_id),
      stories.map(s => s.points),
      stories.map(s => s.reply_count),
      stories.map(s => s.posted_at),
    ],
    options,
  )
  await write(
    `/* replaceHackerNewsComments */
    WITH removed AS (
      DELETE FROM url_hacker_news_comments WHERE url_id = ANY($1::uuid[])
    )
    INSERT INTO url_hacker_news_comments
      (url_id, hacker_news_item_id, parent_story_item_id, posted_at)
    SELECT c.url_id, c.hacker_news_item_id, c.parent_story_item_id, c.posted_at
    FROM unnest($2::uuid[], $3::bigint[], $4::bigint[], $5::timestamptz[])
      AS c(url_id, hacker_news_item_id, parent_story_item_id, posted_at)
  `,
    [
      urlIds,
      comments.map(c => c.url_id),
      comments.map(c => c.hacker_news_item_id),
      comments.map(c => c.parent_story_item_id),
      comments.map(c => c.posted_at),
    ],
    options,
  )
}

/**
 * Replace the stored Hacker News references of a batch of URLs with a fresh lookup. Rows are
 * capped per URL (stories by points, comments by date) and totals keep the real counts. A
 * lookup with zero hits still records its time. The caller supplies one entry per URL.
 */
export async function replaceHackerNewsReferences(
  results: readonly HackerNewsLookupResult[],
  options: QueryOptions = {},
): Promise<void> {
  if (results.length === 0) return
  if (results.length > HACKER_NEWS_URL_BATCH_MAX) {
    throw createError(422, `At most ${HACKER_NEWS_URL_BATCH_MAX} URLs per Hacker News write`)
  }
  if (new Set(results.map(result => result.url_id)).size !== results.length) {
    throw createError(422, 'Hacker News write has a duplicate URL')
  }
  if (options.query || options.client) {
    await withTransactionOptions(options, query => replaceInTransaction(results, query))
    return
  }
  await using transaction = await beginTransaction()
  await replaceInTransaction(results, transaction)
  await transaction.commit()
}
