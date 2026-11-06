import { enqueueMissingHackerNewsLookups } from './hacker-news-lookup-enqueue.mts'
import type { QueryOptions } from '@data-stores/psql/types'
import { getHackerNewsUrlIdsByPostIds } from './hacker-news-post-urls.mts'
import {
  getHackerNewsDetailsByEntity,
  getHackerNewsSummariesByEntity,
} from './hacker-news-references.mts'
import type {
  HackerNewsReferenceCounts,
  HackerNewsReferenceDetail,
} from './hacker-news-references-types.mts'

type ItemWithUrl = { id: string; url?: { id: string } | null } | null | undefined

function urlIdsByItemId(items: readonly ItemWithUrl[]): Record<string, string[]> {
  const urlIds: Record<string, string[]> = {}
  for (const item of items) {
    if (item?.url?.id) urlIds[item.id] = [item.url.id]
  }
  return urlIds
}

/**
 * Hacker News counts for list cards of RSS feed items and podcast episodes (one item row each,
 * so one URL each). Items with no references are omitted. One batch read for the page.
 */
export function getRssFeedItemHackerNewsSummaries(
  items: readonly ItemWithUrl[],
  options: QueryOptions = {},
): Promise<Record<string, HackerNewsReferenceCounts>> {
  return getHackerNewsSummariesByEntity(urlIdsByItemId(items), options)
}

/** Counts and capped item rows for an RSS feed item or podcast episode detail page. */
export function getRssFeedItemHackerNewsDetails(
  items: readonly ItemWithUrl[],
  options: QueryOptions = {},
): Promise<Record<string, HackerNewsReferenceDetail>> {
  const urlIds = urlIdsByItemId(items)
  void enqueueMissingHackerNewsLookups(Object.values(urlIds).flat())
  return getHackerNewsDetailsByEntity(urlIds, options)
}

/** Hacker News counts for post cards. A post's URLs are its link URL and live related URLs. */
export async function getPostHackerNewsSummaries(
  postIds: readonly string[],
  options: QueryOptions = {},
): Promise<Record<string, HackerNewsReferenceCounts>> {
  const urlIds = await getHackerNewsUrlIdsByPostIds(postIds, options)
  return getHackerNewsSummariesByEntity(urlIds, options)
}

/** Counts and capped item rows for a post detail page, deduped across the post's URLs. */
export async function getPostHackerNewsDetails(
  postIds: readonly string[],
  options: QueryOptions = {},
): Promise<Record<string, HackerNewsReferenceDetail>> {
  const urlIds = await getHackerNewsUrlIdsByPostIds(postIds, options)
  void enqueueMissingHackerNewsLookups(Object.values(urlIds).flat())
  return getHackerNewsDetailsByEntity(urlIds, options)
}
