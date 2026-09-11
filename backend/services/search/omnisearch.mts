import { getTopicIds } from '@services/topics/search/get-ids'
import {
  searchUrlHostnames,
  currentUserCanFilterHostnameModeration,
} from '@services/urls-hostnames'
import { searchCommunities } from '@services/communities'
import {
  getTopicIdsCached,
  searchUrlHostnamesCached,
  searchCommunitiesCached,
} from '@services/entity-fetch/search-caches'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import type { PrivateUser } from '@services/users/types'
import { searchNewsVertical, searchPostsVertical } from './omnisearch-content-verticals.mts'

const DEFAULT_LIMIT = 3

export type OmnisearchTopic = {
  id: string
  name: string
  slug: string
  topic_type: string
}

export type OmnisearchPost = {
  id: string
  post_type: string
  title: string
  authored_title: string | null
  declared_language: string | null
  lingua_rs_detected_language: string | null
}

export type OmnisearchNewsItem = {
  id: string
  url: string
  title: string
  feed_title: string
}

export type OmnisearchDomain = {
  id: string
  hostname: string
}

export type OmnisearchCommunity = {
  id: string
  name: string
  slug: string
  bookmarked: boolean
}

export type OmnisearchResult = {
  topics: OmnisearchTopic[]
  posts: OmnisearchPost[]
  news: OmnisearchNewsItem[]
  domains: OmnisearchDomain[]
  communities: OmnisearchCommunity[]
}

export type OmnisearchOptions = {
  /** Authenticated user; controls which cached vs. live paths are used. */
  currentUser?: PrivateUser | null
  /** Plain-text portion of the query after hashtag mentions are stripped. */
  textSearchQuery?: string
  /** Topic IDs resolved from `#topic-name` mentions for verticals that support topic filtering. */
  hashtagTopicIds?: string[]
  /** Unlinked alias IDs resolved from hashtag mentions for post and news filtering. */
  hashtagAliasIds?: string[]
  /** An unresolved hashtag makes the complete AND-filtered search empty. */
  hasUnknownHashtag?: boolean
  /** Per-vertical result cap. Defaults to 3. */
  limit?: number
}

function hasPositiveBookmark(p: Record<string, boolean> | undefined): boolean {
  return Boolean(p?.['follow'] || p?.['save'] || p?.['proxy_follow'])
}

async function searchTopicsVertical(options: OmnisearchOptions): Promise<OmnisearchTopic[]> {
  const {
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    limit = DEFAULT_LIMIT,
  } = options
  if (hasUnknownHashtag || hashtagAliasIds?.length) return []
  const params = {
    text_search_query: textSearchQuery,
    hashtag_topic_ids: hashtagTopicIds?.length ? hashtagTopicIds : undefined,
    limit,
  }
  const { results } = currentUser ? await getTopicIds(params) : await getTopicIdsCached(params)
  return results.map(r => ({ id: r.id, name: r.name, slug: r.slug, topic_type: r.topic_type }))
}

async function searchDomainsVertical(options: OmnisearchOptions): Promise<OmnisearchDomain[]> {
  const {
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    limit = DEFAULT_LIMIT,
  } = options
  if (hasUnknownHashtag || hashtagAliasIds?.length || hashtagTopicIds?.length) return []
  if (!textSearchQuery) return []
  const blocked = currentUserCanFilterHostnameModeration(currentUser) ? undefined : (false as const)
  const params = { query: textSearchQuery, limit, blocked }
  const { results } = currentUser
    ? await searchUrlHostnames(params)
    : await searchUrlHostnamesCached(params)
  return results.map(h => ({ id: h.id, hostname: h.hostname }))
}

async function searchCommunitiesVertical(
  options: OmnisearchOptions,
): Promise<OmnisearchCommunity[]> {
  const {
    currentUser,
    textSearchQuery,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    limit = DEFAULT_LIMIT,
  } = options
  if (hasUnknownHashtag || hashtagAliasIds?.length) return []
  const params = {
    search: textSearchQuery,
    topicIds: hashtagTopicIds?.length ? hashtagTopicIds : undefined,
    limit,
  }
  const { results } = currentUser
    ? await searchCommunities({ currentUser, ...params })
    : await searchCommunitiesCached(params)
  if (results.length === 0) return []
  const communityIds = results.map(c => c.id)
  const bookmarksMap = currentUser
    ? await getBookmarksForEntities(currentUser, 'community', communityIds)
    : {}
  return results.map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    bookmarked: hasPositiveBookmark(
      (bookmarksMap as Record<string, Record<string, boolean>>)[c.id],
    ),
  }))
}

/**
 * Fan out across all five search verticals in parallel and return a lightweight
 * merged payload.  Individual vertical failures degrade to an empty array for
 * that vertical rather than failing the whole request.
 */
export async function searchOmnisearch(options: OmnisearchOptions): Promise<OmnisearchResult> {
  const limit = options.limit ?? DEFAULT_LIMIT

  const [topicsR, postsR, newsR, domainsR, communitiesR] = await Promise.allSettled([
    searchTopicsVertical({ ...options, limit }),
    searchPostsVertical({ ...options, limit }),
    searchNewsVertical({ ...options, limit }),
    searchDomainsVertical({ ...options, limit }),
    searchCommunitiesVertical({ ...options, limit }),
  ])

  return {
    topics: topicsR.status === 'fulfilled' ? topicsR.value : [],
    posts: postsR.status === 'fulfilled' ? postsR.value : [],
    news: newsR.status === 'fulfilled' ? newsR.value : [],
    domains: domainsR.status === 'fulfilled' ? domainsR.value : [],
    communities: communitiesR.status === 'fulfilled' ? communitiesR.value : [],
  }
}
