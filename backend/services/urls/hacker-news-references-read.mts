import { getHackerNewsReferenceLimit } from './hacker-news-reference-limits.mts'
import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type {
  HackerNewsCommentReference,
  HackerNewsReferenceCounts,
  HackerNewsStoryReference,
} from './hacker-news-references-types.mts'

export type HackerNewsUrlItems = {
  stories: HackerNewsStoryReference[]
  comments: HackerNewsCommentReference[]
}

/** Unique URL ids in runtime-bounded chunks; no id is ever dropped. */
function urlIdChunks(urlIds: readonly string[]): string[][] {
  const batchSize = getHackerNewsReferenceLimit('url_batch_size')
  const unique = [...new Set(urlIds)]
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += batchSize) {
    chunks.push(unique.slice(i, i + batchSize))
  }
  return chunks
}

/**
 * Runs one read per chunk of unique url ids and concatenates the rows. Chunks run one after
 * another so a large page holds one pool connection, not one per chunk. The input is one list
 * page of entities (page size is clamped by the routes) with at most
 * 1 + HACKER_NEWS_RELATED_URLS_PER_POST_MAX urls each, so the chunk count follows that page.
 */
async function readInChunks<Row>(
  urlIds: readonly string[],
  readChunk: (ids: string[]) => Promise<Row[]>,
): Promise<Row[]> {
  const rows: Row[] = []
  for (const ids of urlIdChunks(urlIds)) {
    // oxlint-disable-next-line no-await-in-loop -- sequential chunks hold one pool connection
    rows.push(...(await readChunk(ids)))
  }
  return rows
}

/** Totals of a URL's canonical row, plus that row's id so callers can dedupe and read items. */
export type HackerNewsCanonicalTotals = HackerNewsReferenceCounts & { canonical_url_id: string }

/**
 * Totals for URLs whose canonical row Hacker News links at least once, keyed by the caller's
 * url id. References are stored on the canonical row, which `urls.canonical_url_id` reaches
 * after the fact, so each id resolves through `urls` first. One read per chunk of url ids.
 */
export async function getHackerNewsTotalsByUrlIds(
  urlIds: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, HackerNewsCanonicalTotals>> {
  return new Map(await readInChunks(urlIds, ids => readTotals(ids, options)))
}

async function readTotals(ids: string[], options: QueryOptions) {
  const { rows } = await read(
    `/* getHackerNewsTotalsByUrlIds */
    SELECT resolved.url_id,
           totals.url_id AS canonical_url_id,
           totals.story_count,
           totals.comment_count
    FROM (
      SELECT source.id AS url_id,
             COALESCE(source.canonical_url_id, source.id) AS canonical_id
      FROM urls source
      WHERE source.id = ANY($1::uuid[])
    ) resolved
    JOIN url_hacker_news_totals totals ON totals.url_id = resolved.canonical_id
    WHERE (totals.story_count > 0 OR totals.comment_count > 0)
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
  for (const row of await readInChunks(urlIds, ids => readItemRows(ids, options))) {
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
    SELECT requested.url_id, selected.*
    FROM unnest($1::uuid[]) requested(url_id)
    CROSS JOIN LATERAL (
      (SELECT 'story' AS kind, hacker_news_item_id, points, reply_count,
              NULL::bigint AS parent_story_item_id, posted_at
       FROM url_hacker_news_stories WHERE url_id = requested.url_id
       ORDER BY points DESC, hacker_news_item_id DESC LIMIT $2)
      UNION ALL
      (SELECT 'comment', hacker_news_item_id, NULL, NULL, parent_story_item_id, posted_at
       FROM url_hacker_news_comments WHERE url_id = requested.url_id
       ORDER BY posted_at DESC, hacker_news_item_id DESC LIMIT $3)
    ) selected
  `,
    [
      ids,
      getHackerNewsReferenceLimit('stories_per_url'),
      getHackerNewsReferenceLimit('comments_per_url'),
    ],
    options,
  )
  return rows
}
