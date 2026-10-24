import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import type { BasicUser } from '@services/users/types'
import type { CommunityListItemType } from './types.mts'

function postEligibility(currentUser: BasicUser | null | undefined): SQLStatement {
  return currentUser
    ? buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
        currentUserId: currentUser.id,
        includeArchivedCommunities: true,
        isAdministrator: currentUser.roles.includes('administrator'),
      })
    : buildPublicPostEligibilityFilter('candidate_post', 'root_post', {
        includeArchivedCommunities: true,
      })
}

/** Joins that the item type's eligibility filter reads. */
export function listItemJoins(itemType: CommunityListItemType): SQLStatement {
  switch (itemType) {
    case 'post':
      return sql`
      JOIN posts candidate_post ON candidate_post.id = list_item.post_id
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)`
    case 'url_hostname':
      return sql`
      JOIN url_hostnames candidate_hostname ON candidate_hostname.id = list_item.url_hostname_id`
    case 'topic':
    case 'rss_feed':
    case 'url':
      return sql``
    /* v8 ignore next 2 -- exhaustive selector guard; the type admits no other value */
    default:
      throw new Error(`Unknown community list item type: ${String(itemType)}`)
  }
}

/** Viewer eligibility predicate appended after the live-row `WHERE` clause. */
export function listItemEligibility(
  itemType: CommunityListItemType,
  currentUser: BasicUser | null | undefined,
): SQLStatement {
  switch (itemType) {
    case 'post':
      return sql` AND `.append(postEligibility(currentUser))
    case 'url_hostname':
      return currentUser?.roles.includes('administrator')
        ? sql``
        : sql` AND candidate_hostname.publicly_introduced_at IS NOT NULL
      AND NOT candidate_hostname.is_blocked`
    case 'topic':
    case 'rss_feed':
    case 'url':
      return sql``
    /* v8 ignore next 2 -- exhaustive selector guard; the type admits no other value */
    default:
      throw new Error(`Unknown community list item type: ${String(itemType)}`)
  }
}

/** One count subquery body: everything after `FROM <table>` up to the closing parenthesis. */
export function listItemCountBody(
  itemType: CommunityListItemType,
  communityId: string,
  entityColumn: string,
  currentUser: BasicUser | null | undefined,
): SQLStatement {
  switch (itemType) {
    case 'post':
      return sql` list_item
          JOIN posts candidate_post ON candidate_post.id = `
        .append(`list_item.${entityColumn}`)
        .append(
          sql`
          JOIN posts root_post
            ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
          WHERE list_item.community_id = ${communityId}
            AND list_item.removed_at IS NULL
            AND `,
        )
        .append(postEligibility(currentUser))
    case 'url_hostname':
      return currentUser?.roles.includes('administrator')
        ? sql` list_item
        JOIN url_hostnames candidate_hostname ON candidate_hostname.id = list_item.url_hostname_id
        WHERE list_item.community_id = ${communityId}
          AND list_item.removed_at IS NULL`
        : sql` list_item
        JOIN url_hostnames candidate_hostname ON candidate_hostname.id = list_item.url_hostname_id
        WHERE list_item.community_id = ${communityId}
          AND list_item.removed_at IS NULL AND candidate_hostname.publicly_introduced_at IS NOT NULL
          AND NOT candidate_hostname.is_blocked`
    case 'topic':
    case 'rss_feed':
    case 'url':
      return sql` list_item
        WHERE list_item.community_id = ${communityId}
          AND list_item.removed_at IS NULL`
    /* v8 ignore next 2 -- exhaustive selector guard; the type admits no other value */
    default:
      throw new Error(`Unknown community list item type: ${String(itemType)}`)
  }
}
