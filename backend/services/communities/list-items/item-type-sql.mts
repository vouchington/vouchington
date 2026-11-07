import { assertNever } from '@modules/utils/assert-never'
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

/** Target joins for one membership walk. Alias is `page`. */
export function listItemJoins(itemType: CommunityListItemType): SQLStatement {
  switch (itemType) {
    case 'post':
      return sql`
      JOIN posts candidate_post ON candidate_post.id = page.post_id
      JOIN posts root_post
        ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)`
    case 'url_hostname':
      return sql`
      JOIN url_hostnames candidate_hostname
        ON candidate_hostname.id = page.url_hostname_id`
    case 'topic':
    case 'rss_feed':
    case 'url':
      return sql``
    default:
      return assertNever(itemType, 'Unknown community list item type')
  }
}

/** Whether the joined target of one membership row is visible. Missing targets are ineligible. */
export function listItemPageEligible(
  itemType: CommunityListItemType,
  currentUser: BasicUser | null | undefined,
): SQLStatement {
  switch (itemType) {
    case 'post':
      return sql`candidate_post.id IS NOT NULL AND root_post.id IS NOT NULL AND `.append(
        postEligibility(currentUser),
      )
    case 'url_hostname':
      return currentUser?.roles.includes('administrator')
        ? sql`candidate_hostname.id IS NOT NULL`
        : sql`candidate_hostname.id IS NOT NULL
          AND candidate_hostname.publicly_introduced_at IS NOT NULL
          AND NOT candidate_hostname.is_blocked`
    case 'topic':
    case 'rss_feed':
    case 'url':
      return sql`TRUE`
    default:
      return assertNever(itemType, 'Unknown community list item type')
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
    default:
      return assertNever(itemType, 'Unknown community list item type')
  }
}
