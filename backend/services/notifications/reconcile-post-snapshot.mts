import { write } from '@data-stores/psql'
import {
  buildNotificationPostEligibilityFilter,
  buildPublicPostEligibilityFilter,
} from '@modules/feed-query-builders'
import sql from 'sql-template-strings'

export type PostNotificationSnapshot = {
  id: string
  post_type: string
  title: string
  markdown: string
  slug: string | null
  created_at: Date
  created_by_id: string | null
  username: string | null
  is_anonymous: boolean
  broadcast: string
  privacy: string
  clearance_status: string
  is_content_eligible: boolean
  is_manual_send_content_eligible: boolean
  parent_id: string | null
  root_id: string | null
  root_created_by_id: string | null
  root_broadcast: string
  root_privacy: string
  root_slug: string | null
  root_post_type: string | null
}

export async function getPostNotificationSnapshot(
  postId: string,
): Promise<PostNotificationSnapshot | null> {
  const query = sql`/* getPostNotificationSnapshot */
    SELECT
      posts.id,
      posts.post_type,
      posts.title,
      posts.markdown,
      post_slugs.slug,
      posts.created_at,
      posts.created_by_id,
      users.username,
      posts.is_anonymous,
      posts.broadcast,
      posts.privacy,
      clearance.change_type AS clearance_status,
      `
  query
    .append(buildNotificationPostEligibilityFilter('posts', 'root_posts'))
    .append(sql` AS is_content_eligible,
      `)
    .append(
      buildPublicPostEligibilityFilter('posts', 'root_posts', {
        includeRegisteredAudience: true,
      }),
    ).append(sql` AND posts.post_type <> 'comment'
      AND posts.openai_omni_moderation_flagged IS NOT TRUE
      AND root_posts.openai_omni_moderation_flagged IS NOT TRUE
      AS is_manual_send_content_eligible,
      posts.parent_id,
      posts.root_id,
      root_posts.created_by_id AS root_created_by_id,
      root_posts.broadcast AS root_broadcast,
      root_posts.privacy AS root_privacy,
      root_slugs.slug AS root_slug,
      root_posts.post_type AS root_post_type
    FROM posts
    LEFT JOIN post_slugs ON post_slugs.post_id = posts.id
    LEFT JOIN users ON users.id = posts.created_by_id
    LEFT JOIN post_clearance_changes clearance
      ON clearance.id = posts.latest_clearance_change_id
    LEFT JOIN posts root_posts ON root_posts.id = COALESCE(posts.root_id, posts.id)
    LEFT JOIN post_slugs root_slugs ON root_slugs.post_id = root_posts.id
    WHERE posts.id = ${postId}
    LIMIT 1
  `)

  const { rows } = await write(query)
  return (rows[0] as PostNotificationSnapshot | undefined) ?? null
}
