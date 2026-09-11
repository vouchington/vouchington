'use client'

/**
 * Combined omnisearch endpoint — single request, server fans out across all five
 * entity types and returns a lightweight merged response.
 *
 * This is the data path used when the `combinedSearch` feature flag is enabled.
 * When the flag is off the command-search dialog fans out to the five individual
 * entity endpoints instead (see command-search-data-search.ts).
 */

import { clientApi } from './instance'
import type { Topic } from '@/types/topics'
import type { Post } from '@/types/posts'
import type { Hostname } from '@/types/hostnames'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { Community } from '@/types/api-responses'
import type { CommandSearchPost, SearchResults } from '@/components/command-search-data'

// Lightweight per-entity shapes returned by /api/v1/search.
// Only the fields the command-search dialog actually renders are included.

type CombinedSearchTopic = Pick<Topic, 'id' | 'name' | 'slug' | 'topic_type'>

type CombinedSearchPost = Pick<
  Post,
  'id' | 'post_type' | 'declared_language' | 'lingua_rs_detected_language'
> & {
  title: string
  authored_title: string | null
}

type CombinedSearchDomain = Pick<Hostname, 'id' | 'hostname'>

// The heavy RssFeedItem type has nested objects; the combined endpoint flattens them.
type CombinedSearchNewsItem = {
  id: string
  url: string
  title: string
  feed_title: string
}

type CombinedSearchCommunity = Pick<Community, 'id' | 'name' | 'slug'> & {
  /** True when the authenticated user follows/saves/proxy-follows this community. */
  bookmarked: boolean
}

type CombinedSearchResponse = {
  topics: CombinedSearchTopic[]
  posts: CombinedSearchPost[]
  news: CombinedSearchNewsItem[]
  domains: CombinedSearchDomain[]
  communities: CombinedSearchCommunity[]
}

/**
 * Fetch all five search verticals in one request and return them as a
 * SearchResults-compatible object for the command-search dialog.
 *
 * Bookmarked communities are sorted to the top (mirrors sortByBookmarked in
 * command-search-data-search.ts, which is already a no-op for all other
 * verticals at the list endpoint).
 */
export async function fetchCombinedSearch(q: string, signal: AbortSignal): Promise<SearchResults> {
  const data = await clientApi.get<CombinedSearchResponse>('/api/v1/search', {
    searchParams: { q },
    signal,
  })

  // Sort bookmarked communities first, preserving server order within each group.
  const communities = data.communities.toSorted(
    (a, b) => (b.bookmarked ? 1 : 0) - (a.bookmarked ? 1 : 0),
  )

  return {
    topics: data.topics as unknown as Topic[],
    posts: data.posts satisfies CommandSearchPost[],
    news: data.news.map(item => ({
      id: item.id,
      url: { url: item.url },
      data: { title: item.title },
      rss_feed: { title: item.feed_title },
    })) as unknown as RssFeedItem[],
    domains: data.domains as unknown as Hostname[],
    communities: communities as unknown as Community[],
    fediverse: [],
  }
}
