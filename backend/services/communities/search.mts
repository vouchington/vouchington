import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo } from '@modules/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { Community, CommunityListType, CommunityMetrics } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import { appendFeedCategoryFilter } from './search/feed-category-filter.mts'
import { appendTopicIdsFilter } from './search/topic-ids-filter.mts'
import { mapCommunitySearchResult } from './search/result-mapper.mts'
import { appendEligiblePostTypeFilter } from './search/eligible-post-type-filter.mts'
import { parseCommunitySearchCursor } from './search/cursor.mts'
import type { CommunityRootPostType } from './post-type-settings.mts'

export type CommunitySortMode = 'name' | 'members' | 'virtual_subscriptions'
export type CommunityFeedCategory = 'posts' | 'news' | 'news_sources' | 'news_topics'

export type CommunityOwner = {
  id: string
  username: string | null
}

export type SearchCommunitiesResult = {
  results: Community[]
  users: Record<string, CommunityOwner>
  page_info: ReturnType<typeof buildPageInfo>
  community_metrics: Record<string, CommunityMetrics>
}

export async function searchCommunities(
  options?: QueryOptions & {
    currentUser?: PrivateUser | null
    search?: string
    limit?: number
    after?: string
    memberUserId?: string
    sort?: CommunitySortMode
    listType?: CommunityListType
    listScope?: 'mine'
    feedCategory?: CommunityFeedCategory
    hasListType?: boolean
    hasListItems?: boolean
    topicIds?: string[]
    hashtagHasNoMatches?: boolean
    eligiblePostType?: CommunityRootPostType
  },
): Promise<SearchCommunitiesResult> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  const sort = options?.sort ?? 'name'
  const needsMetrics = true

  const { cursorName, cursorId, cursorScore } = parseCommunitySearchCursor(options?.after, sort)

  const searchQuery = sql`/* searchCommunities */
    SELECT c.*,
      u.id AS owner_id,
      u.username AS owner_username`

  if (needsMetrics) {
    searchQuery.append(sql`,
      vm.member_count,
      vm.post_count,
      vm.list_item_count,
      vm.proxy_follow_count,
      vm.proxy_mute_count,
      vm.virtual_subscription_count`)
  }

  searchQuery.append(sql`
    FROM communities c
    LEFT JOIN users u ON u.id = c.created_by_id`)

  if (needsMetrics) {
    searchQuery.append(sql`
    JOIN view_community_metrics vm ON vm.id = c.id`)
  }

  searchQuery.append(sql`
    WHERE c.deleted_at IS NULL`)

  appendEligiblePostTypeFilter(searchQuery, options?.currentUser, options?.eligiblePostType)
  if (options?.hashtagHasNoMatches) searchQuery.append(sql` AND FALSE`)

  if (options?.memberUserId) {
    searchQuery.append(sql`
      AND EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = c.id
          AND cm.user_id = ${options.memberUserId}
          AND cm.removed_at IS NULL
      )`)
  }

  if (options?.listScope === 'mine') {
    assert(options.currentUser, 401, 'Unauthorized')
    searchQuery.append(sql`
      AND (
        EXISTS (
          SELECT 1 FROM community_members cm
          WHERE cm.community_id = c.id
            AND cm.user_id = ${options.currentUser.id}
            AND cm.removed_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM relation__user__proxy_follow__community rpf
          WHERE rpf.object_id = c.id
            AND rpf.subject_id = ${options.currentUser.id}
            AND rpf.deleted_at IS NULL
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM relation__user__proxy_mute__community rpm
        WHERE rpm.object_id = c.id
          AND rpm.subject_id = ${options.currentUser.id}
          AND rpm.deleted_at IS NULL
      )`)
  }

  // Private communities are visible to administrators and active members.
  const isAdministrator = options?.currentUser?.roles?.includes('administrator') ?? false
  const isOwnMemberFilter =
    !!options?.memberUserId && options.memberUserId === options?.currentUser?.id
  if (!isOwnMemberFilter && !isAdministrator) {
    const currentUserId = options?.currentUser?.id
    if (currentUserId) {
      searchQuery.append(sql`
      AND (
        c.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM community_members cm
          WHERE cm.community_id = c.id
            AND cm.user_id = ${currentUserId}
            AND cm.removed_at IS NULL
        )
      )`)
    } else {
      searchQuery.append(sql` AND c.visibility = 'public'`)
    }
  }

  if (options?.search) {
    searchQuery.append(
      sql` AND c.search_vector @@ websearch_to_tsquery('voucha_english', ${options.search})`,
    )
  }

  if (options?.listType) {
    searchQuery.append(sql` AND c.list_type = ${options.listType}`)
  }

  if (options?.hasListType) {
    searchQuery.append(sql` AND c.list_type IS NOT NULL`)
  }

  if (options?.hasListItems) {
    searchQuery.append(sql` AND vm.list_item_count > 0`)
  }

  appendFeedCategoryFilter(searchQuery, options?.feedCategory)
  appendTopicIdsFilter(searchQuery, options?.topicIds)
  if (sort === 'name') {
    if (cursorName !== undefined && cursorId !== undefined) {
      searchQuery.append(sql` AND (c.name, c.id) > (${cursorName}, ${cursorId})`)
    }
    searchQuery.append(sql`
    ORDER BY c.name ASC, c.id ASC
    LIMIT ${limit + 1}`)
  } else if (sort === 'members') {
    if (cursorScore !== undefined && cursorId !== undefined) {
      searchQuery.append(sql` AND (vm.member_count, c.id) < (${cursorScore}, ${cursorId})`)
    }
    searchQuery.append(sql`
    ORDER BY vm.member_count DESC, c.id DESC
    LIMIT ${limit + 1}`)
  } else {
    // virtual_subscriptions
    if (cursorScore !== undefined && cursorId !== undefined) {
      searchQuery.append(
        sql` AND (vm.virtual_subscription_count, c.id) < (${cursorScore}, ${cursorId})`,
      )
    }
    searchQuery.append(sql`
    ORDER BY vm.virtual_subscription_count DESC, c.id DESC
    LIMIT ${limit + 1}`)
  }

  const { rows } = await read(searchQuery, options)

  return mapCommunitySearchResult(rows, { limit, needsMetrics: needsMetrics ?? false, sort })
}
