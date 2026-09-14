import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'

const MAX_CANONICAL_CHAIN_DEPTH = 10
const MAX_POSTS_PER_URL = 5

/**
 * Given an array of url_id UUIDs (from RSS feed items), find posts
 * that have a `post -> related -> url` entity relation OR are link posts
 * with `posts.url_id` matching any of those URLs (following canonical URL chains).
 *
 * Returns a map from url_id to an array of post IDs.
 */
export async function getPostIdsByUrlIds(
  currentUser: PrivateUser | null,
  urlIds: string[],
): Promise<Record<string, string[]>> {
  if (urlIds.length === 0) return {}

  const eligibilityFilter = currentUser
    ? buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
        currentUserId: currentUser.id,
        isAdministrator: currentUser.roles.includes('administrator'),
      })
    : buildPublicPostEligibilityFilter('posts', 'root_post')

  const query = sql`/* getPostIdsByUrlIds */
    WITH RECURSIVE url_chain AS (
      -- Start with all provided URL IDs
      SELECT id, canonical_url_id, id AS origin_url_id, 0 AS depth
      FROM urls
      WHERE id = ANY(${urlIds})

      UNION ALL

      -- Follow each canonical chain
      SELECT u.id, u.canonical_url_id, uc.origin_url_id, uc.depth + 1
      FROM urls u
      INNER JOIN url_chain uc ON u.id = uc.canonical_url_id
      WHERE uc.canonical_url_id IS NOT NULL
        AND uc.depth < ${MAX_CANONICAL_CHAIN_DEPTH}
    ),
    canonical_urls AS (
      SELECT DISTINCT id, origin_url_id
      FROM url_chain
    ),
    relation_posts AS (
      SELECT
        cu.origin_url_id,
        posts.id AS post_id
      FROM "relation__post__related__url" rel
      INNER JOIN canonical_urls cu ON cu.id = rel.object_id
      INNER JOIN posts ON posts.id = rel.subject_id
      INNER JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
      WHERE rel.deleted_at IS NULL
        AND rel.votes_score_net > 0
        AND posts.deleted_at IS NULL
        AND posts.post_type != 'topic_recommendation'
  `

  query.append(sql` AND `).append(eligibilityFilter)

  query.append(sql`
    ),
    link_posts AS (
      SELECT
        cu.origin_url_id,
        posts.id AS post_id
      FROM posts
      INNER JOIN canonical_urls cu ON cu.id = posts.url_id
      INNER JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
      WHERE posts.post_type = 'link'
        AND posts.deleted_at IS NULL
  `)

  query.append(sql` AND `).append(eligibilityFilter)

  query.append(sql`
    ),
    ranked_posts AS (
      SELECT
        origin_url_id,
        post_id,
        ROW_NUMBER() OVER (PARTITION BY origin_url_id ORDER BY post_id DESC) AS rn
      FROM (
        SELECT * FROM relation_posts
        UNION
        SELECT * FROM link_posts
      ) combined
    )
    SELECT origin_url_id, post_id
    FROM ranked_posts
    WHERE rn <= ${MAX_POSTS_PER_URL}
  `)

  const { rows } = await read(query)

  const result: Record<string, string[]> = {}
  for (const row of rows) {
    const urlId = row.origin_url_id as string
    const postId = row.post_id as string
    if (!result[urlId]) result[urlId] = []
    result[urlId].push(postId)
  }
  return result
}
