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
import type { SearchResults } from './command-search-results'

const EMPTY: SearchResults = {
  topics: [],
  posts: [],
  news: [],
  domains: [],
  communities: [],
  fediverse: [],
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

function sortByBookmarked<T extends { id: string }>(
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
