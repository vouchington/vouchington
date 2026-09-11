import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo, decodeScopedTimestampUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PrivateUser } from '@services/users/types'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import { getVisiblePostCollectionRows } from '@services/posts/get-visible-collection-rows'
import { PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE } from '@services/posts/private-collection-pagination'
import type { Post } from '@services/posts/types'
import { getUrlsByIdBatch } from '@services/urls/get-batch'
import type { ViewUrl } from '@services/urls/types'
import { getUrlHostnamesByAnyBatch } from '@services/urls-hostnames/get-batch'
import type { ViewHostname } from '@services/urls-hostnames/types'
import { getCommunitiesByIdBatch } from '@services/communities/get-batch'
import type { CommunityWithOwner } from '@services/communities/get'
import {
  COMMUNITY_LIST_TABLES,
  HOSTNAME_LIST_TABLES,
  POST_LIST_TABLES,
  URL_LIST_TABLES,
  type CommunityListType,
  type HostnameListType,
  type PostListType,
  type UrlListType,
} from '@services/users/profile-collection-tables'
import { compactResults } from '@services/users/profile-collection-ids'
import { getRelationObjectRows } from '@services/users/profile-collection-relation-rows'
import { filterViewableCommunities } from './profile-collection-filters.mts'

const DEFAULT_LIMIT = 100

export async function getUserPostsCollection(
  currentUser: PrivateUser | null,
  userId: string,
  listType: PostListType,
  paginationOptions: { limit?: number; after?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: Post[]; page_info: PageInfo }> {
  const { limit = DEFAULT_LIMIT, after } = paginationOptions
  const scope = getUserPostCollectionCursorScope(userId, listType)
  const afterCursor = after
    ? decodeScopedTimestampUuidCursor(after, scope, 'Invalid private post collection cursor')
    : undefined
  const relationRows = await getVisiblePostCollectionRows(
    currentUser,
    POST_LIST_TABLES[listType],
    userId,
    limit + 1,
    { after: afterCursor },
    options,
  )
  const hasNextPage = relationRows.length > limit
  const pageRows = relationRows.slice(0, limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ timestamp: row.created_us, id: row.entity_id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }

  const posts = await getPostsByAnyBatch(
    pageRows.map(row => row.entity_id),
    options,
  )
  const postsById = new Map(
    posts.filter((post): post is Post => post !== null).map(post => [post.id, post]),
  )
  const results = pageRows.flatMap(row => {
    const post = postsById.get(row.entity_id)
    return post ? [post] : []
  })
  return { results, page_info }
}

export function getUserPostCollectionCursorScope(userId: string, listType: PostListType): string {
  return `user-posts:${userId}:${listType}:${PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE}`
}

export async function getUserUrlsCollection(
  userId: string,
  listType: UrlListType,
  paginationOptions: { limit?: number; after?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: ViewUrl[]; page_info: PageInfo }> {
  const { limit = DEFAULT_LIMIT, after } = paginationOptions
  const scope = `user:${userId}:urls:${listType}`
  const afterCursor = after
    ? decodeScopedTimestampUuidCursor(after, scope, 'Invalid url collection cursor')
    : undefined
  const relationRows = await getRelationObjectRows(
    URL_LIST_TABLES[listType],
    userId,
    limit + 1,
    options,
    {
      after: afterCursor,
    },
  )
  const hasNextPage = relationRows.length > limit
  const pageRows = relationRows.slice(0, limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ timestamp: row.created_us, id: row.entity_id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }

  const urls = await getUrlsByIdBatch(
    pageRows.map(row => row.entity_id),
    options,
  )
  return { results: compactResults(urls), page_info }
}

export async function getUserHostnamesCollection(
  userId: string,
  listType: HostnameListType,
  paginationOptions: { limit?: number; after?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: ViewHostname[]; page_info: PageInfo }> {
  const { limit = DEFAULT_LIMIT, after } = paginationOptions
  const scope = `user:${userId}:domains:${listType}`
  const afterCursor = after
    ? decodeScopedTimestampUuidCursor(after, scope, 'Invalid hostname collection cursor')
    : undefined
  const relationRows = await getRelationObjectRows(
    HOSTNAME_LIST_TABLES[listType],
    userId,
    limit + 1,
    options,
    { after: afterCursor },
  )
  const hasNextPage = relationRows.length > limit
  const pageRows = relationRows.slice(0, limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ timestamp: row.created_us, id: row.entity_id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }

  const hostnames = await getUrlHostnamesByAnyBatch(
    pageRows.map(row => row.entity_id),
    options,
  )
  return { results: compactResults(hostnames), page_info }
}

export async function getUserCommunitiesCollection(
  currentUser: PrivateUser | null,
  userId: string,
  listType: Exclude<CommunityListType, 'member'>,
  paginationOptions: { limit?: number; after?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: CommunityWithOwner[]; page_info: PageInfo }> {
  const { limit = DEFAULT_LIMIT, after } = paginationOptions
  const scope = `user:${userId}:communities:${listType}`
  const afterCursor = after
    ? decodeScopedTimestampUuidCursor(after, scope, 'Invalid community collection cursor')
    : undefined
  // page_info/cursors must be derived from the raw relation rows fetched here, before
  // filterViewableCommunities below can shrink the resolved page — otherwise a page where
  // every community is filtered out would report a null cursor with has_next_page still true.
  const relationRows = await getRelationObjectRows(
    COMMUNITY_LIST_TABLES[listType],
    userId,
    limit + 1,
    options,
    { after: afterCursor },
  )
  const hasNextPage = relationRows.length > limit
  const pageRows = relationRows.slice(0, limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ timestamp: row.created_us, id: row.entity_id, scope }),
  })
  if (pageRows.length === 0) return { results: [], page_info }

  const communities = await getCommunitiesByIdBatch(
    pageRows.map(row => row.entity_id),
    options,
  )
  const viewable = await filterViewableCommunities(currentUser, compactResults(communities))
  return { results: viewable, page_info }
}
