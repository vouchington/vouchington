import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  HACKER_NEWS_RELATED_URLS_PER_POST_MAX,
  HACKER_NEWS_URL_BATCH_MAX,
} from './hacker-news-references-types.mts'

/**
 * The post's link URL followed by at most ten live, positively voted related URLs, best first.
 * Each per-post lateral probe stops through the positive subject/best index. The filter
 * uses this same URL selection, so it matches references visible on the card.
 */
export async function getHackerNewsUrlIdsByPostIds(
  postIds: readonly string[],
  options: QueryOptions = {},
): Promise<Record<string, string[]>> {
  const ids = [...new Set(postIds)]
  const urlIdsByPostId: Record<string, string[]> = {}
  for (let start = 0; start < ids.length; start += HACKER_NEWS_URL_BATCH_MAX) {
    // no-mistakes-disable-next-line query-reached-per-item: one bounded chunk of post ids per query, not an individual post.
    const { rows } = await read<{ post_id: string; url_id: string }>( // oxlint-disable-line no-await-in-loop -- bounded chunks avoid concurrent database fan-out.
      `/* getHackerNewsUrlIdsByPostIds */
      SELECT post_id, url_id FROM (
        SELECT requested.post_id, selected_url.*
        FROM unnest($1::uuid[]) AS requested(post_id)
        CROSS JOIN LATERAL (${buildHackerNewsPostUrlsSql('requested.post_id')}) selected_url
      ) selected
      ORDER BY post_id, source_order, votes_score_sort DESC, created_at DESC, url_id DESC`,
      [ids.slice(start, start + HACKER_NEWS_URL_BATCH_MAX)],
      options,
    )
    for (const row of rows) {
      const urlIds = urlIdsByPostId[row.post_id] ?? []
      urlIdsByPostId[row.post_id] = urlIds
      if (!urlIds.includes(row.url_id)) urlIds.push(row.url_id)
    }
  }
  return urlIdsByPostId
}

/** Shared card and filter selection. Expressions are fixed call-site identifiers, never user input. */
export function buildHackerNewsPostUrlsSql(postId: 'requested.post_id' | 'candidate.id'): string {
  return `
    SELECT own.url_id, 0 AS source_order, NULL::double precision AS votes_score_sort,
      NULL::timestamptz AS created_at
    FROM posts own WHERE own.id = ${postId} AND own.post_type = 'link' AND own.url_id IS NOT NULL
    UNION ALL
    SELECT related.url_id, 1 AS source_order, related.votes_score_sort, related.created_at
    FROM LATERAL (
      SELECT rel.object_id AS url_id, rel.votes_score_sort, rel.created_at
      FROM "relation__post__related__url" rel
      WHERE rel.subject_id = ${postId} AND rel.deleted_at IS NULL AND rel.votes_score_net > 0
      ORDER BY rel.votes_score_sort DESC, rel.created_at DESC, rel.object_id DESC
      LIMIT ${HACKER_NEWS_RELATED_URLS_PER_POST_MAX}
    ) related`
}
