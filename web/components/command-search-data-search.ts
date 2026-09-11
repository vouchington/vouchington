/**
 * Tab-specific search functions and extract/sort helpers for the global command search dialog.
 */

import { fetchPosts } from '@/lib/api/client/posts'
import { fetchTopics } from '@/lib/api/client/topics'
import { fetchHostnames } from '@/lib/api/client/hostnames'
import { fetchRssFeedItems } from '@/lib/api/client/rss-feed-items'
import { fetchCommunities } from '@/lib/api/client/communities'
import { fetchFediverseSearch } from '@/lib/api/client/fediverse'
import type { Topic } from '@/types/topics'
import type { Post } from '@/types/posts'
import type { Hostname } from '@/types/hostnames'
import type { RssFeedItem } from '@/types/rss-feed-items'
import type { Community } from '@/types/api-responses'
import type { SearchResults } from './command-search-data'

const EMPTY: SearchResults = {
  topics: [],
  posts: [],
  news: [],
  domains: [],
  communities: [],
  fediverse: [],
}

/**
 * Fan out to all five verticals in parallel and commit once when all settle.
 * Uses allSettled so a failing vertical returns [] instead of wiping everything.
 */
export async function searchAll(q: string, signal: AbortSignal): Promise<SearchResults> {
  const [topicsR, postsR, newsR, hostnamesR, communitiesR] = await Promise.allSettled([
    fetchTopics({ q, limit: 3, signal }),
    fetchPosts({ q, limit: 3, signal }),
    fetchRssFeedItems({ q, limit: 3, signal }),
    fetchHostnames({ q, limit: 3, signal }),
    fetchCommunities({ q, limit: 3, signal }),
  ])

  return {
    topics:
      topicsR.status === 'fulfilled'
        ? sortByBookmarked(extractTopics(topicsR.value), topicsR.value.bookmarks)
        : [],
    posts:
      postsR.status === 'fulfilled'
        ? sortByBookmarked(extractPosts(postsR.value), postsR.value.bookmarks)
        : [],
    news:
      newsR.status === 'fulfilled'
        ? sortByBookmarked(extractRssFeedItems(newsR.value), newsR.value.bookmarks)
        : [],
    domains: hostnamesR.status === 'fulfilled' ? extractHostnames(hostnamesR.value) : [],
    communities:
      communitiesR.status === 'fulfilled'
        ? sortByBookmarked(extractCommunities(communitiesR.value), communitiesR.value.bookmarks)
        : [],
    fediverse: [],
  }
}

/**
 * Fan out to all five verticals in parallel and call onVertical for each as it
 * settles, enabling progressive rendering — fast verticals appear immediately
 * without waiting for slow ones.
 *
 * A failing or aborted vertical is silently dropped (onVertical is not called).
 * Returns a promise that resolves once all five fetches have settled.
 */
export async function searchAllProgressive(
  q: string,
  signal: AbortSignal,
  onVertical: (partial: Partial<SearchResults>) => void,
): Promise<void> {
  async function settle<T>(
    promise: Promise<T>,
    extract: (data: T) => Partial<SearchResults>,
  ): Promise<void> {
    try {
      const data = await promise
      if (!signal.aborted) onVertical(extract(data))
    } catch {
      // Rejected (including AbortError from signal) — silently drop; no partial update.
    }
  }

  await Promise.all([
    settle(fetchTopics({ q, limit: 3, signal }), data => ({
      topics: sortByBookmarked(extractTopics(data), data.bookmarks),
    })),
    settle(fetchPosts({ q, limit: 3, signal }), data => ({
      posts: sortByBookmarked(extractPosts(data), data.bookmarks),
    })),
    settle(fetchRssFeedItems({ q, limit: 3, signal }), data => ({
      news: sortByBookmarked(extractRssFeedItems(data), data.bookmarks),
    })),
    settle(fetchHostnames({ q, limit: 3, signal }), data => ({ domains: extractHostnames(data) })),
    settle(fetchCommunities({ q, limit: 3, signal }), data => ({
      communities: sortByBookmarked(extractCommunities(data), data.bookmarks),
    })),
  ])
}

export async function searchTopicsOnly(q: string, signal: AbortSignal): Promise<SearchResults> {
  const data = await fetchTopics({ q, limit: 5, signal })
  return { ...EMPTY, topics: sortByBookmarked(extractTopics(data), data.bookmarks) }
}

export async function searchPostsOnly(q: string, signal: AbortSignal): Promise<SearchResults> {
  const data = await fetchPosts({ q, limit: 5, signal })
  return { ...EMPTY, posts: sortByBookmarked(extractPosts(data), data.bookmarks) }
}

export async function searchNewsOnly(q: string, signal: AbortSignal): Promise<SearchResults> {
  const data = await fetchRssFeedItems({ q, limit: 5, signal })
  return { ...EMPTY, news: sortByBookmarked(extractRssFeedItems(data), data.bookmarks) }
}

export async function searchDomainsOnly(q: string, signal: AbortSignal): Promise<SearchResults> {
  const data = await fetchHostnames({ q, limit: 5, signal })
  return { ...EMPTY, domains: extractHostnames(data) }
}

export async function searchCommunitiesOnly(
  q: string,
  signal: AbortSignal,
): Promise<SearchResults> {
  const data = await fetchCommunities({ q, limit: 5, signal })
  return {
    ...EMPTY,
    communities: sortByBookmarked(extractCommunities(data), data.bookmarks),
  }
}

export async function searchFediverseOnly(q: string, signal: AbortSignal): Promise<SearchResults> {
  const data = await fetchFediverseSearch({ q, limit: 5, signal })
  return { ...EMPTY, fediverse: data.buckets.flatMap(bucket => bucket.items) }
}

function extractTopics(data: Awaited<ReturnType<typeof fetchTopics>>): Topic[] {
  return data.results.flatMap(r => {
    const x = data.topics[r.id]
    return x !== undefined ? [x] : []
  })
}

function extractPosts(data: Awaited<ReturnType<typeof fetchPosts>>): Post[] {
  return data.results.flatMap(r => {
    const x = data.posts[r.id]
    return x !== undefined ? [x] : []
  })
}

function extractRssFeedItems(data: Awaited<ReturnType<typeof fetchRssFeedItems>>): RssFeedItem[] {
  return data.results.flatMap(r => {
    const x = data.rss_feed_items[r.id]
    return x !== undefined ? [x] : []
  })
}

function extractHostnames(data: Awaited<ReturnType<typeof fetchHostnames>>): Hostname[] {
  return data.results.flatMap(r => {
    const x = data.hostnames[r.id]
    return x !== undefined ? [x] : []
  })
}

function extractCommunities(data: Awaited<ReturnType<typeof fetchCommunities>>): Community[] {
  return data.results.flatMap(r => {
    const x = data.communities[r.id]
    return x !== undefined ? [x] : []
  })
}

export function sortByBookmarked<T extends { id: string }>(
  items: T[],
  bookmarks?: Record<string, Record<string, boolean>>,
): T[] {
  if (!bookmarks) return items
  return items.toSorted((a, b) => {
    const aB = hasPositiveBookmark(bookmarks[a.id]) ? 1 : 0
    const bB = hasPositiveBookmark(bookmarks[b.id]) ? 1 : 0
    return bB - aB
  })
}

function hasPositiveBookmark(predicates: Record<string, boolean> | undefined): boolean {
  if (!predicates) return false
  return Boolean(predicates['follow'] || predicates['save'] || predicates['proxy_follow'])
}
