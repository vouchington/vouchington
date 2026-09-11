import type { BasicUser } from '@services/users/types'
import { isAdminUser } from '@services/users/authorization'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import type { PostSearchOptions } from '../types.mts'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'

export function appendBaseFilters(
  filters: SQLStatement[],
  currentUser: BasicUser | undefined,
  { exclude_for_user_id, include_topic_recommendations, post_types, user_id }: PostSearchOptions,
): boolean {
  filters.push(sql`posts.deleted_at IS NULL`)
  filters.push(sql`posts.community_id IS NULL`)
  if (!include_topic_recommendations) filters.push(sql`posts.post_type != 'topic_recommendation'`)
  if (!post_types?.length) filters.push(sql`posts.post_type != 'comment'`)

  const isAdmin = isAdminUser(currentUser ?? null)
  if (currentUser) {
    const viewerEligibility = sql`EXISTS (
      SELECT 1
      FROM posts root_post
      WHERE root_post.id = COALESCE(posts.root_id, posts.id)
        AND `
    viewerEligibility.append(
      buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
        currentUserId: currentUser.id,
        isAdministrator: isAdmin,
      }),
    ).append(sql`
    )`)
    filters.push(viewerEligibility)
  } else {
    const publicEligibility = sql`EXISTS (
      SELECT 1
      FROM posts root_post
      WHERE root_post.id = COALESCE(posts.root_id, posts.id)
        AND `
    publicEligibility.append(buildPublicPostEligibilityFilter('posts', 'root_post')).append(sql`
    )`)
    filters.push(publicEligibility)
  }
  if (exclude_for_user_id) appendUserExclusionFilters(filters)
  if (user_id) appendUserFilter(filters, { currentUser, isAdmin, user_id })
  return isAdmin
}

function appendUserExclusionFilters(filters: SQLStatement[]): void {
  filters.push(sql`NOT EXISTS (
      SELECT 1 FROM excluded_users WHERE excluded_users.user_id = posts.created_by_id
    )`)
  filters.push(
    sql`NOT EXISTS (
      SELECT 1
      FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` AS ptc
      JOIN excluded_topics ON excluded_topics.topic_id = ptc.object_id
      WHERE ptc.subject_id = posts.id
        AND ptc.deleted_at IS NULL
        AND ptc.votes_score_net > 0
    )`),
  )
  filters.push(sql`NOT EXISTS (
      SELECT 1
      FROM relation__post__related__url pru
      JOIN urls ON urls.id = pru.object_id
      WHERE pru.subject_id = posts.id
        AND pru.deleted_at IS NULL
        AND pru.votes_score_net > 0
        AND urls.hostname_id IN (SELECT hostname_id FROM excluded_hostname_ids)
    )`)
}

function appendUserFilter(
  filters: SQLStatement[],
  {
    currentUser,
    isAdmin,
    user_id,
  }: {
    currentUser?: BasicUser
    isAdmin: boolean
    user_id: string
  },
): void {
  filters.push(sql`posts.created_by_id = ${user_id}`)
  if (!isAdmin && currentUser?.id !== user_id) filters.push(sql`posts.is_anonymous IS NOT TRUE`)
}
