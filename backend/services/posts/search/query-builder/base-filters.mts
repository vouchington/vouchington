import type { BasicUser } from '@services/users/types'
import { isAdminUser } from '@services/users/authorization'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import type { PostSearchOptions } from '../types.mts'
import { BLOCKED_POST_TYPES } from '@voucha/types/entities/post'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'

export function appendBaseFilters(
  filters: SQLStatement[],
  currentUser: BasicUser | undefined,
  {
    exclude_for_user_id,
    include_topic_recommendations,
    post_types,
    profileCountPostType,
    public_eligibility_only,
    user_id,
  }: PostSearchOptions,
): boolean {
  filters.push(sql`posts.deleted_at IS NULL`)
  filters.push(sql`posts.community_id IS NULL`)
  // A profile count's only post_type predicate is its literal, so the partial index can be proved.
  if (!profileCountPostType && !include_topic_recommendations) {
    filters.push(sql`posts.post_type != 'topic_recommendation'`)
  }
  if (!profileCountPostType && !post_types?.length) filters.push(sql`posts.post_type != 'comment'`)

  // Public-only callers (MCP read_posts(search)) are judged as signed out, so neither an author nor an
  // administrator widens what they see. The exclusions below still follow `currentUser`.
  const viewer = public_eligibility_only ? undefined : currentUser
  const isAdmin = isAdminUser(viewer ?? null)
  const rootEligibility = (rootAlias: 'posts' | 'root_post'): SQLStatement => {
    if (viewer)
      return buildViewerPostDiscoveryEligibilityFilter('posts', rootAlias, {
        currentUserId: viewer.id,
        isAdministrator: isAdmin,
      })
    const eligibility = buildPublicPostEligibilityFilter('posts', rootAlias)
    // A reply is readable when it and the thread root are, so only the root's type can block a
    // comment. Comments are searched only when asked for, so only then does the root need judging.
    if (public_eligibility_only && post_types?.includes('comment'))
      eligibility
        .append(sql` AND (posts.post_type <> 'comment' OR `)
        .append(rootAlias)
        .append(sql`.post_type::text <> ALL(${[...BLOCKED_POST_TYPES]}::text[]))`)
    return eligibility
  }
  // Root posts already supply their own access row; only replies need a keyed root probe.
  const discoveryEligibility = sql`CASE WHEN posts.root_post_id IS NULL THEN `
  discoveryEligibility.append(rootEligibility('posts')).append(sql` ELSE EXISTS (
    SELECT 1 FROM posts root_post
    WHERE root_post.id = posts.root_post_id AND `)
  discoveryEligibility.append(rootEligibility('root_post')).append(sql`) END`)
  filters.push(discoveryEligibility)
  if (exclude_for_user_id) appendUserExclusionFilters(filters)
  if (user_id) {
    appendUserFilter(filters, {
      currentUser: viewer,
      isAdmin,
      user_id,
      anonymousEqualsFalse: profileCountPostType !== undefined,
    })
  }
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
      JOIN url_hostnames blocked_hostname ON blocked_hostname.id = urls.hostname_id
      WHERE pru.subject_id = posts.id
        AND pru.deleted_at IS NULL
        AND pru.votes_score_net > 0
        AND (urls.hostname_id IN (SELECT hostname_id FROM excluded_hostname_ids)
             OR blocked_hostname.is_blocked)
    )`)
}

function appendUserFilter(
  filters: SQLStatement[],
  {
    anonymousEqualsFalse,
    currentUser,
    isAdmin,
    user_id,
  }: {
    anonymousEqualsFalse: boolean
    currentUser?: BasicUser
    isAdmin: boolean
    user_id: string
  },
): void {
  filters.push(buildPostSearchAuthorFilter(user_id))
  if (isAdmin || currentUser?.id === user_id) return
  filters.push(
    anonymousEqualsFalse ? sql`posts.is_anonymous = false` : sql`posts.is_anonymous IS NOT TRUE`,
  )
}

/** Static aliases keep the same bound author scope visible to candidate planning. */
export function buildPostSearchAuthorFilter(
  userId: string,
  postAlias: 'posts' | 'semantic_vector_post' = 'posts',
): SQLStatement {
  return sql``.append(postAlias).append(sql`.created_by_id = ${userId}`)
}
