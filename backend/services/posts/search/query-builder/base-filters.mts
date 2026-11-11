import type { BasicUser } from '@services/users/types'
import { isAdminUser } from '@services/users/authorization'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildHostnameExclusionExists,
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import type { PostSearchOptions } from '../types.mts'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'
import { appendFollowingPhaseFilters } from './ranked-page-queries.mts'

export function appendBaseFilters(
  filters: SQLStatement[],
  currentUser: BasicUser | undefined,
  {
    exclude_for_user_id,
    following_phase,
    include_archived_communities,
    post_types,
    profileCountPostType,
    user_id,
  }: PostSearchOptions,
): boolean {
  filters.push(sql`posts.deleted_at IS NULL`)
  // Profile facet counts retain their existing global-post scope; discovery accepts communities.
  if (profileCountPostType) filters.push(sql`posts.community_id IS NULL`)
  // A profile count's only post_type predicate is its literal, so the partial index can be proved.
  if (!profileCountPostType && !post_types?.length) filters.push(sql`posts.post_type != 'comment'`)

  const viewer = currentUser
  const isAdmin = isAdminUser(viewer ?? null)
  // Root posts already supply their own access row; only replies need a keyed root probe.
  const discoveryEligibility = sql`CASE WHEN posts.root_post_id IS NULL THEN `
  if (viewer) {
    discoveryEligibility.append(
      buildViewerPostDiscoveryEligibilityFilter('posts', 'posts', {
        currentUserId: viewer.id,
        includeArchivedCommunities: include_archived_communities === true,
        isAdministrator: isAdmin,
      }),
    )
  } else {
    discoveryEligibility.append(
      buildPublicPostEligibilityFilter('posts', 'posts', {
        includeArchivedCommunities: include_archived_communities === true,
      }),
    )
  }
  discoveryEligibility.append(sql` ELSE EXISTS (
    SELECT 1 FROM posts root_post WHERE root_post.id = posts.root_post_id AND `)
  if (viewer) {
    discoveryEligibility.append(
      buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
        currentUserId: viewer.id,
        includeArchivedCommunities: include_archived_communities === true,
        isAdministrator: isAdmin,
      }),
    )
  } else {
    discoveryEligibility.append(
      buildPublicPostEligibilityFilter('posts', 'root_post', {
        includeArchivedCommunities: include_archived_communities === true,
      }),
    )
  }
  discoveryEligibility.append(sql`) END`)
  filters.push(discoveryEligibility)
  if (following_phase && viewer) appendFollowingPhaseFilters(filters, viewer.id, following_phase)
  if (exclude_for_user_id) appendUserExclusionFilters(filters, exclude_for_user_id)
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

function appendUserExclusionFilters(filters: SQLStatement[], userId: string): void {
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
  const hostnameFilter = sql`NOT EXISTS (
      SELECT 1
      FROM relation__post__related__url pru
      JOIN urls ON urls.id = pru.object_id
      JOIN url_hostnames blocked_hostname ON blocked_hostname.id = urls.hostname_id
      WHERE pru.subject_id = posts.id
        AND pru.deleted_at IS NULL
        AND pru.votes_score_net > 0
        AND (`.append(
    buildHostnameExclusionExists(
      userId,
      sql`blocked_hostname.id`,
      sql`blocked_hostname.reversed_hostname`,
    ),
  ).append(sql` OR blocked_hostname.is_blocked)
    )`)
  filters.push(hostnameFilter)
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
