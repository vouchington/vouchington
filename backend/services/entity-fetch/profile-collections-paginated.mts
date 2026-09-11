import type { QueryOptions } from '@data-stores/psql/types'
import {
  buildPageInfo,
  decodeScopedScoreCursor,
  decodeScopedTimestampUuidCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { getCommunitiesByIdBatch } from '@services/communities/get-batch'
import type { CommunityWithOwner } from '@services/communities/get'
import { listUserMemberCommunities } from '@services/communities/members/member-communities'
import { searchRecentlyViewedPage } from '@services/recently-viewed'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import type { Topic } from '@services/topics/types'
import { compactResults } from '@services/users/profile-collection-ids'
import { TOPIC_LIST_TABLES, type TopicListType } from '@services/users/profile-collection-tables'
import { getRelationObjectRows } from '@services/users/profile-collection-relation-rows'
import type { PrivateUser } from '@services/users/types'

const DEFAULT_LIMIT = 100

async function getUserTopicRelationCollection(
  userId: string,
  listType: Exclude<TopicListType, 'viewed'>,
  pagination: { limit: number; after?: string },
  options: QueryOptions = {},
): Promise<{ results: Topic[]; page_info: PageInfo }> {
  const scope = `user:${userId}:topics:${listType}`
  const afterCursor = pagination.after
    ? decodeScopedTimestampUuidCursor(pagination.after, scope, `Invalid ${listType}-topic cursor`)
    : undefined
  const relationRows = await getRelationObjectRows(
    TOPIC_LIST_TABLES[listType],
    userId,
    pagination.limit + 1,
    options,
    { after: afterCursor },
  )
  const hasNextPage = relationRows.length > pagination.limit
  const pageRows = relationRows.slice(0, pagination.limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ timestamp: row.created_us, id: row.entity_id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }

  const topics = await getTopicsByAnyBatch(
    pageRows.map(row => row.entity_id),
    options,
  )
  return { results: compactResults(topics), page_info }
}

async function getUserViewedTopicsCollection(
  userId: string,
  pagination: { limit: number; after?: string },
  options: QueryOptions = {},
): Promise<{ results: Topic[]; page_info: PageInfo }> {
  const scope = `user:${userId}:topics:viewed`
  const after = pagination.after
    ? decodeScopedScoreCursor(pagination.after, scope, 'Invalid viewed-topic cursor')
    : undefined
  const rows = await searchRecentlyViewedPage('topic', userId, pagination.limit + 1, after)
  const pageRows = rows.slice(0, pagination.limit)
  return {
    results: compactResults(
      await getTopicsByAnyBatch(
        pageRows.map(row => row.id),
        options,
      ),
    ),
    page_info: buildPageInfo(pageRows, {
      hasNextPage: rows.length > pagination.limit,
      getCursor: row => ({ score: row.score, id: row.id, scope }),
    }),
  }
}

export async function getUserTopicsCollectionPage(
  userId: string,
  listType: TopicListType,
  pagination: { limit?: number; after?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: Topic[]; page_info: PageInfo }> {
  const boundedPagination = { limit: pagination.limit ?? DEFAULT_LIMIT, after: pagination.after }
  if (listType === 'viewed') {
    return getUserViewedTopicsCollection(userId, boundedPagination, options)
  }
  return getUserTopicRelationCollection(userId, listType, boundedPagination, options)
}

export async function getUserMemberCommunitiesCollection(
  currentUser: PrivateUser | null,
  userId: string,
  paginationOptions: { limit?: number; after?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: CommunityWithOwner[]; page_info: PageInfo }> {
  const collection = await listUserMemberCommunities(
    userId,
    currentUser,
    paginationOptions,
    options,
  )
  if (collection.results.length === 0) return { ...collection, results: [] }

  const communities = await getCommunitiesByIdBatch(
    collection.results.map(member => member.community_id),
    options,
  )
  return { ...collection, results: compactResults(communities) }
}
