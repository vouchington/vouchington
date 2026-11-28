import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import { getPostsWorkLimit } from '../work-limits.mts'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'

/**
 * Given an array of url_id UUIDs (from RSS feed items), find posts
 * that have a `post -> related -> url` entity relation OR are link posts
 * with `posts.url_id` matching an input URL or its terminal canonical URL.
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
  const linkPostEligibility = sql`posts.post_type = 'link' AND `.append(eligibilityFilter)

  const query = sql`/* getPostIdsByUrlIds */
    WITH canonical_urls AS (
      SELECT DISTINCT input.id AS origin_url_id, input.id
      FROM unnest(${urlIds}::uuid[]) AS input(id)
      UNION ALL
      SELECT id AS origin_url_id, canonical_url_id AS id
      FROM urls
      WHERE id = ANY(${urlIds}::uuid[])
        AND canonical_url_id IS NOT NULL
    ),
    relation_posts AS (
      SELECT
        cu.origin_url_id,
        posts.id AS post_id
      FROM "relation__post__related__url" rel
      INNER JOIN canonical_urls cu ON cu.id = rel.object_id
      INNER JOIN posts ON posts.id = rel.subject_id
      INNER JOIN posts root_post ON root_post.id = COALESCE(posts.root_post_id, posts.id)
      WHERE rel.deleted_at IS NULL
        AND rel.votes_score_net > 0
        AND posts.deleted_at IS NULL
        AND posts.post_type != 'topic_recommendation'
  `

  query.append(sql` AND `).append(eligibilityFilter)

  query
    .append(sql`
    ),
    link_posts AS (
      SELECT
        posts.url_id AS origin_url_id,
        posts.id AS post_id
      FROM posts
      INNER JOIN posts root_post ON root_post.id = COALESCE(posts.root_post_id, posts.id)
      WHERE posts.url_id = ANY(${urlIds}::uuid[])
        AND `)
    .append(linkPostEligibility)
    .append(sql`
      UNION ALL
      SELECT
        origin.id AS origin_url_id,
        posts.id AS post_id
      FROM urls origin
      INNER JOIN posts ON posts.url_id = origin.canonical_url_id
      INNER JOIN posts root_post ON root_post.id = COALESCE(posts.root_post_id, posts.id)
      WHERE origin.id = ANY(${urlIds}::uuid[])
        AND origin.canonical_url_id IS NOT NULL
        AND `)
    .append(linkPostEligibility)

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
    WHERE rn <= ${getPostsWorkLimit('max_posts_per_url')}
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
