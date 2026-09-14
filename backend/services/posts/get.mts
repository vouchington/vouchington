import type { QueryOptions } from '@data-stores/psql/types'
import { isSlug, isUUID } from '@modules/utils'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createError from 'http-errors'
import type { Post, PostType } from './types.mts'

export const getPostByAny = async (
  idOrSlug: string,
  options?: QueryOptions,
): Promise<Post | null> => {
  if (isUUID(idOrSlug)) {
    const { rows } = await read<Post>(
      sql`/* getPostByAny */
      SELECT *
      FROM view_posts
      WHERE id = ${idOrSlug}
      LIMIT 1
    `,
      options,
    )
    return rows[0] || null
  }

  if (isSlug(idOrSlug)) {
    // Use CTE to lookup post_id from slug first, then query view by ID
    const { rows } = await read<Post>(
      sql`/* getPostByAny */
      WITH slug_lookup AS (
        SELECT post_id
        FROM post_slugs
        WHERE slug = ${idOrSlug.toLowerCase()}
        LIMIT 1
      )
      SELECT vp.*
      FROM view_posts vp
      JOIN slug_lookup ON vp.id = slug_lookup.post_id
      LIMIT 1
    `,
      options,
    )
    return rows[0] || null
  }

  // If we get here, it's neither a UUID nor a slug
  throw createError(422, 'Invalid post id or slug')
}

type DeletedPostLookup = {
  id: string
  post_type: PostType
  created_at: Date
  root_id: string | null
  parent_id: string | null
  created_by_id: string | null
  community_id: string | null
  review_topic_ratings?: Array<{ topic_id: string }> | null
}

export const getDeletedPostByAny = async (
  idOrSlug: string,
  options?: QueryOptions,
): Promise<DeletedPostLookup | null> => {
  const isId = isUUID(idOrSlug)
  const isSlugValue = isSlug(idOrSlug)

  if (!isId && !isSlugValue) {
    throw createError(422, 'Invalid post id or slug')
  }

  const query = sql`/* getDeletedPostByAny */
    SELECT
      posts.id,
      posts.post_type,
      posts.created_at,
      posts.root_id,
      posts.parent_id,
      posts.created_by_id,
      posts.community_id,
      CASE WHEN posts.post_type = 'review' THEN (
        SELECT JSON_AGG(jsonb_build_object('topic_id', prtr.topic_id))
        FROM post_review_topic_ratings prtr
        WHERE prtr.post_id = posts.id
      ) ELSE NULL END AS review_topic_ratings
    FROM posts
    WHERE posts.id =
  `
  if (isId) {
    query.append(sql`${idOrSlug}`)
  } else {
    query.append(sql`
      (
        SELECT post_id
        FROM post_slugs
        WHERE slug = ${idOrSlug.toLowerCase()}
        LIMIT 1
      )
    `)
  }
  query.append(sql`
    LIMIT 1
  `)

  const { rows } = await read(query, options)
  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    post_type: row.post_type,
    created_at: row.created_at,
    root_id: row.root_id,
    parent_id: row.parent_id,
    created_by_id: row.created_by_id,
    community_id: row.community_id,
    review_topic_ratings: row.review_topic_ratings ?? null,
  }
}

export async function getPostModerationCompletion(
  postId: string,
  options?: QueryOptions,
): Promise<{
  openai_omni_moderation_completed: boolean
  spam_detection_completed: boolean
} | null> {
  const { rows } = await read(
    sql`/* getPostModerationCompletion */
      SELECT
        EXISTS (
          SELECT 1 FROM post_moderation_dispositions disposition
          WHERE disposition.version_id = version.id
            AND disposition.source = 'openai_omni'
            AND disposition.disposition <> 'incomplete'
        ) AS openai_omni_moderation_completed,
        EXISTS (
          SELECT 1 FROM post_moderation_dispositions disposition
          WHERE disposition.version_id = version.id
            AND disposition.source = 'spam_detection'
            AND disposition.disposition <> 'incomplete'
        ) AS spam_detection_completed
      FROM posts post
      JOIN post_moderation_versions version
        ON version.post_id = post.id
       AND version.content_sha256 = post.llm_moderation_content_sha256
      WHERE post.id = ${postId}
      LIMIT 1
    `,
    options,
  )
  return rows[0] || null
}

/** Returns true if the slug exists in post_slugs, including slugs for deleted posts. */
export async function postSlugExists(slug: string): Promise<boolean> {
  const { rows } = await read(
    `/* postSlugExists */ SELECT 1 FROM post_slugs WHERE slug = $1 LIMIT 1`,
    [slug.toLowerCase()],
  )
  return rows.length > 0
}
