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
import { buildFollowingPhaseFilter } from './ranked-page-queries.mts'

export function buildBaseFilters(
  currentUser: BasicUser | undefined,
  {
    exclude_for_user_id,
    following_phase,
    include_archived_communities,
    post_types,
    profileCountPostType,
    user_id,
  }: PostSearchOptions,
): SQLStatement[] {
  const viewer = currentUser
  const isAdmin = isAdminUser(viewer ?? null)
  return [
    sql`posts.deleted_at IS NULL`,
    // Profile facet counts retain their existing global-post scope; discovery accepts communities.
    ...(profileCountPostType ? [sql`posts.community_id IS NULL`] : []),
    // A profile count's only post_type predicate is its literal, so the partial index can be proved.
    ...(!profileCountPostType && !post_types?.length ? [sql`posts.post_type != 'comment'`] : []),
    buildDiscoveryEligibility(viewer, isAdmin, include_archived_communities === true),
    ...(following_phase && viewer ? [buildFollowingPhaseFilter(viewer.id, following_phase)] : []),
    ...(exclude_for_user_id ? buildUserExclusionFilters(exclude_for_user_id) : []),
    ...(user_id
      ? buildUserFilter({
          currentUser: viewer,
          isAdmin,
          user_id,
          anonymousEqualsFalse: profileCountPostType !== undefined,
        })
      : []),
  ]
}

function buildDiscoveryEligibility(
  viewer: BasicUser | undefined,
  isAdmin: boolean,
  includeArchivedCommunities: boolean,
): SQLStatement {
  const viewerOptions = {
    currentUserId: viewer?.id ?? '',
    includeArchivedCommunities,
    isAdministrator: isAdmin,
  }
  // Root posts already supply their own access row; only replies need a keyed root probe.
  return sql`CASE WHEN posts.root_post_id IS NULL THEN `
    .append(
      viewer
        ? buildViewerPostDiscoveryEligibilityFilter('posts', 'posts', viewerOptions)
        : buildPublicPostEligibilityFilter('posts', 'posts', { includeArchivedCommunities }),
    )
    .append(sql` ELSE EXISTS (
    SELECT 1 FROM posts root_post WHERE root_post.id = posts.root_post_id AND `)
    .append(
      viewer
        ? buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', viewerOptions)
        : buildPublicPostEligibilityFilter('posts', 'root_post', { includeArchivedCommunities }),
    )
    .append(sql`) END`)
}

function buildUserExclusionFilters(userId: string): SQLStatement[] {
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
  return [
    sql`NOT EXISTS (
      SELECT 1 FROM excluded_users WHERE excluded_users.user_id = posts.created_by_id
    )`,
    sql`NOT EXISTS (
      SELECT 1
      FROM `.append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` AS ptc
      JOIN excluded_topics ON excluded_topics.topic_id = ptc.object_id
      WHERE ptc.subject_id = posts.id
        AND ptc.deleted_at IS NULL
        AND ptc.votes_score_net > 0
    )`),
    hostnameFilter,
  ]
}

function buildUserFilter({
  anonymousEqualsFalse,
  currentUser,
  isAdmin,
  user_id,
}: {
  anonymousEqualsFalse: boolean
  currentUser?: BasicUser
  isAdmin: boolean
  user_id: string
}): SQLStatement[] {
  const authorFilter = buildPostSearchAuthorFilter(user_id)
  if (isAdmin || currentUser?.id === user_id) return [authorFilter]
  return [
    authorFilter,
    anonymousEqualsFalse ? sql`posts.is_anonymous = false` : sql`posts.is_anonymous IS NOT TRUE`,
  ]
}

/** Static aliases keep the same bound author scope visible to candidate planning. */
export function buildPostSearchAuthorFilter(
  userId: string,
  postAlias: 'posts' | 'semantic_vector_post' = 'posts',
): SQLStatement {
  return sql``.append(postAlias).append(sql`.created_by_id = ${userId}`)
}
