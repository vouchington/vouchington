import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  HACKER_NEWS_URL_BATCH_MAX,
  type HackerNewsCommentReference,
  type HackerNewsReferenceCounts,
  type HackerNewsStoryReference,
} from './hacker-news-references-types.mts'

export type HackerNewsUrlItems = {
  stories: HackerNewsStoryReference[]
  comments: HackerNewsCommentReference[]
}

function uniqueBoundedUrlIds(urlIds: readonly string[]): string[] {
  return [...new Set(urlIds)].slice(0, HACKER_NEWS_URL_BATCH_MAX)
}

/** Totals for URLs that Hacker News links at least once. One read for the whole batch. */
export async function getHackerNewsTotalsByUrlIds(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, HackerNewsReferenceCounts>> {
  const ids = uniqueBoundedUrlIds(urlIds)
  if (ids.length === 0) return new Map()
  const { rows } = await read(
    `/* getHackerNewsTotalsByUrlIds */
    SELECT url_id, story_count, comment_count
    FROM url_hacker_news_totals
    WHERE url_id = ANY($1::uuid[])
      AND (story_count > 0 OR comment_count > 0)
  `,
    [ids],
    options,
  )
  return new Map(
    rows.map(row => [
      row.url_id as string,
      { story_count: Number(row.story_count), comment_count: Number(row.comment_count) },
    ]),
  )
}

/** Capped story and comment rows for a batch of URLs in one read. */
export async function getHackerNewsItemsByUrlIds(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, HackerNewsUrlItems>> {
  const ids = uniqueBoundedUrlIds(urlIds)
  const itemsByUrlId = new Map<string, HackerNewsUrlItems>()
  if (ids.length === 0) return itemsByUrlId
  const { rows } = await read(
    `/* getHackerNewsItemsByUrlIds */
    SELECT url_id, 'story' AS kind, hacker_news_item_id, points, reply_count,
           NULL::bigint AS parent_story_item_id, posted_at
    FROM url_hacker_news_stories
    WHERE url_id = ANY($1::uuid[])
    UNION ALL
    SELECT url_id, 'comment', hacker_news_item_id, NULL, NULL, parent_story_item_id, posted_at
    FROM url_hacker_news_comments
    WHERE url_id = ANY($1::uuid[])
  `,
    [ids],
    options,
  )
  for (const row of rows) {
    const urlId = row.url_id as string
    const items = itemsByUrlId.get(urlId) ?? { stories: [], comments: [] }
    itemsByUrlId.set(urlId, items)
    const postedAt = new Date(row.posted_at as Date | string).toISOString()
    if (row.kind === 'story') {
      items.stories.push({
        hacker_news_item_id: Number(row.hacker_news_item_id),
        points: Number(row.points),
        reply_count: Number(row.reply_count),
        posted_at: postedAt,
      })
    } else {
      items.comments.push({
        hacker_news_item_id: Number(row.hacker_news_item_id),
        parent_story_item_id: Number(row.parent_story_item_id),
        posted_at: postedAt,
      })
    }
  }
  return itemsByUrlId
}
