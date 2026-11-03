import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { HACKER_NEWS_RELATED_URLS_PER_POST_MAX } from './hacker-news-references-types.mts'

/**
 * The URLs a post can show Hacker News references for: its own link URL plus its live,
 * positively voted related URLs, at most HACKER_NEWS_RELATED_URLS_PER_POST_MAX related URLs
 * per post, best first. The reference filter (`buildPostHasHackerNewsReferences`) accepts any
 * positively voted related URL, so a post can match it yet show nothing when its only
 * referenced URL ranks below that cap. One read.
 */
export async function getHackerNewsUrlIdsByPostIds(
  postIds: readonly string[],
  options: QueryOptions = {},
): Promise<Record<string, string[]>> {
  const ids = [...new Set(postIds)]
  const urlIdsByPostId: Record<string, string[]> = {}
  if (ids.length === 0) return urlIdsByPostId
  const { rows } = await read(
    `/* getHackerNewsUrlIdsByPostIds */
    SELECT id AS post_id, url_id
    FROM posts
    WHERE id = ANY($1::uuid[])
      AND post_type = 'link'
      AND url_id IS NOT NULL
    UNION
    SELECT ranked.post_id, ranked.url_id
    FROM (
      SELECT rel.subject_id AS post_id,
             rel.object_id AS url_id,
             ROW_NUMBER() OVER (
               PARTITION BY rel.subject_id
               ORDER BY rel.votes_score_net DESC, rel.object_id DESC
             ) AS rank
      FROM "relation__post__related__url" rel
      WHERE rel.subject_id = ANY($1::uuid[])
        AND rel.deleted_at IS NULL
        AND rel.votes_score_net > 0
    ) ranked
    WHERE ranked.rank <= $2
  `,
    [ids, HACKER_NEWS_RELATED_URLS_PER_POST_MAX],
    options,
  )
  for (const row of rows) {
    const postId = row.post_id as string
    const urlIds = urlIdsByPostId[postId] ?? []
    urlIds.push(row.url_id as string)
    urlIdsByPostId[postId] = urlIds
  }
  return urlIdsByPostId
}
