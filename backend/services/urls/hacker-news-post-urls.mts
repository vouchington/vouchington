import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  HACKER_NEWS_RELATED_URLS_PER_POST_MAX,
  HACKER_NEWS_URL_BATCH_MAX,
} from './hacker-news-references-types.mts'

/**
 * The post's link URL followed by at most ten live, positively voted related URLs, best first.
 * Each per-post lateral probe stops through the subject/best index. The search filter accepts
 * any positive related URL, so a lower-ranked referenced URL can match without a card label.
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
        SELECT id AS post_id, url_id, 0 AS source_order,
               NULL::double precision AS votes_score_sort, NULL::timestamptz AS created_at
        FROM posts
        WHERE id = ANY($1::uuid[]) AND post_type = 'link' AND url_id IS NOT NULL
        UNION ALL
        SELECT requested.post_id, related.url_id, 1 AS source_order,
               related.votes_score_sort, related.created_at
        FROM unnest($1::uuid[]) AS requested(post_id)
        CROSS JOIN LATERAL (
          SELECT rel.object_id AS url_id, rel.votes_score_sort, rel.created_at
          FROM "relation__post__related__url" rel
          WHERE rel.subject_id = requested.post_id
            AND rel.deleted_at IS NULL AND rel.votes_score_net > 0
          ORDER BY rel.votes_score_sort DESC, rel.created_at DESC, rel.object_id DESC
          LIMIT $2
        ) related
      ) selected
      ORDER BY post_id, source_order, votes_score_sort DESC, created_at DESC, url_id DESC`,
      [ids.slice(start, start + HACKER_NEWS_URL_BATCH_MAX), HACKER_NEWS_RELATED_URLS_PER_POST_MAX],
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
