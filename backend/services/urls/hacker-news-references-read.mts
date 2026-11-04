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

/** Unique URL ids in reads of at most HACKER_NEWS_URL_BATCH_MAX each; no id is ever dropped. */
function urlIdChunks(urlIds: readonly string[]): string[][] {
  const unique = [...new Set(urlIds)]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += HACKER_NEWS_URL_BATCH_MAX) {
    chunks.push(unique.slice(i, i + HACKER_NEWS_URL_BATCH_MAX))
  }
  return chunks
}

/** Totals of a URL's canonical row, plus that row's id so callers can dedupe and read items. */
export type HackerNewsCanonicalTotals = HackerNewsReferenceCounts & { canonical_url_id: string }

/**
 * Totals for URLs whose canonical row Hacker News links at least once, keyed by the caller's
 * url id. References are stored on the canonical row, which `urls.canonical_url_id` reaches
 * after the fact, so each id resolves through `urls` first. Resolution follows two hops, the
 * same bound as the list filter: `setCanonicalUrl` flattens chains and a concurrent call can
 * leave one extra hop. One read per chunk of url ids.
 */
export async function getHackerNewsTotalsByUrlIds(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, HackerNewsCanonicalTotals>> {
  const results = await Promise.all(urlIdChunks(urlIds).map(ids => readTotals(ids, options)))
  return new Map(results.flat())
}

async function readTotals(ids: string[], options: QueryOptions) {
  const { rows } = await read(
    `/* getHackerNewsTotalsByUrlIds */
    SELECT source.id AS url_id,
           totals.url_id AS canonical_url_id,
           totals.story_count,
           totals.comment_count
    FROM urls source
    LEFT JOIN urls hop ON hop.id = source.canonical_url_id
    JOIN url_hacker_news_totals totals
      ON totals.url_id = COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id)
    WHERE source.id = ANY($1::uuid[])
      AND (totals.story_count > 0 OR totals.comment_count > 0)
  `,
    [ids],
    options,
  )
  return rows.map(
    row =>
      [
        row.url_id as string,
        {
          canonical_url_id: row.canonical_url_id as string,
          story_count: Number(row.story_count),
          comment_count: Number(row.comment_count),
        },
      ] as [string, HackerNewsCanonicalTotals],
  )
}

/** Capped story and comment rows for a batch of canonical url ids (from the totals read). */
export async function getHackerNewsItemsByUrlIds(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, HackerNewsUrlItems>> {
  const itemsByUrlId = new Map<string, HackerNewsUrlItems>()
  const chunks = await Promise.all(urlIdChunks(urlIds).map(ids => readItemRows(ids, options)))
  for (const row of chunks.flat()) {
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

async function readItemRows(ids: string[], options: QueryOptions) {
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
  return rows
}
