import { hasHackerNewsLink, hackerNewsUrlIdentity } from './hacker-news-algolia-identity.mts'
import { areHackerNewsLookupsEnabled, hackerNewsQueueConfig } from '@queues/hacker-news/config'
import { setTimeout } from 'node:timers/promises'
import { throwIfRateLimitedResponse } from '@modules/queue-errors'
import { canonicalizeUrl, isBareDomainUrl } from '@vouchington/utils/urls'
import { cancelResponseBody, fetchWithTimeout, handleHttpErrors } from '@modules/utils/http'
import { getHackerNewsWorkLimit, hackerNewsWorkConfig } from './hacker-news-work-limits.mts'
import type {
  HackerNewsStoryReference,
  HackerNewsCommentReference,
} from './hacker-news-references-types.mts'

export type HackerNewsLookupInput = { urlId: string; url: string }
export type HackerNewsLookupResult = {
  urlId: string
  stories: HackerNewsStoryReference[]
  comments: HackerNewsCommentReference[]
}

type Hit = Record<string, unknown>

/** Bounded searches only; provider errors propagate so the queue can retry without erasing facts. */
export async function fetchHackerNewsReferences(
  inputs: readonly HackerNewsLookupInput[],
): Promise<HackerNewsLookupResult[]> {
  await hackerNewsQueueConfig.waitForInitialization()
  const results: HackerNewsLookupResult[] = []
  const search = async (url: string, kind: 'story' | 'comment') => {
    if (!areHackerNewsLookupsEnabled()) return null
    try {
      return await searchAlgolia(url, kind)
    } finally {
      // Hold the global worker slot between requests, including the last request in a job.
      await setTimeout(1000)
    }
  }
  for (const input of inputs) {
    const result: HackerNewsLookupResult = { urlId: input.urlId, stories: [], comments: [] }
    results.push(result)
    const target = canonicalizeUrl(input.url)
    if (!target || isBareDomainUrl(target.url)) continue
    // Search the shared identity so scheme/mobile/tracking tokens cannot hide variants.
    // YouTube host/path variants share only the video id in Algolia's token index.
    const query = target.identity.startsWith('youtube.com/watch?v=')
      ? target.identity.slice('youtube.com/watch?v='.length)
      : target.identity
    // oxlint-disable-next-line no-await-in-loop -- external API requests share the lane budget
    const stories = await search(query, 'story')
    if (!stories) return []
    const storyIds = new Set<number>()
    for (const hit of stories) {
      const id = positiveInteger(hit.objectID)
      const postedAt = timestamp(hit.created_at)
      if (
        !id ||
        !postedAt ||
        hackerNewsUrlIdentity(hit.url) !== target.identity ||
        storyIds.has(id)
      )
        continue
      storyIds.add(id)
      result.stories.push({
        hacker_news_item_id: id,
        points: nonnegativeInteger(hit.points),
        reply_count: nonnegativeInteger(hit.num_comments),
        posted_at: postedAt,
      })
    }
    // oxlint-disable-next-line no-await-in-loop -- external API requests share the lane budget
    const comments = await search(query, 'comment')
    if (!comments) return []
    const commentIds = new Set<number>()
    for (const hit of comments) {
      const id = positiveInteger(hit.objectID)
      const storyId = positiveInteger(hit.story_id)
      const postedAt = timestamp(hit.created_at)
      if (!id || !storyId || !postedAt || commentIds.has(id)) continue
      if (storyIds.has(storyId) || hackerNewsUrlIdentity(hit.story_url) === target.identity)
        continue
      if (
        typeof hit.comment_text !== 'string' ||
        !hasHackerNewsLink(hit.comment_text, target.identity)
      )
        continue
      commentIds.add(id)
      result.comments.push({
        hacker_news_item_id: id,
        parent_story_item_id: storyId,
        posted_at: postedAt,
      })
    }
    result.stories.sort(
      (a, b) => b.points - a.points || b.hacker_news_item_id - a.hacker_news_item_id,
    )
    result.comments.sort(
      (a, b) =>
        b.posted_at.localeCompare(a.posted_at) || b.hacker_news_item_id - a.hacker_news_item_id,
    )
  }
  return results
}

/* no-mistakes: integration=algolia */
async function searchAlgolia(query: string, kind: 'story' | 'comment'): Promise<Hit[] | null> {
  const url = new URL('https://hn.algolia.com/api/v1/search')
  url.searchParams.set('query', query)
  url.searchParams.set('tags', kind)
  url.searchParams.set('restrictSearchableAttributes', kind === 'story' ? 'url' : 'comment_text')
  await hackerNewsWorkConfig.waitForInitialization()
  const limit = getHackerNewsWorkLimit('hits_per_page')
  url.searchParams.set('hitsPerPage', String(limit))
  const timeout = getHackerNewsWorkLimit('request_timeout_ms')
  if (!areHackerNewsLookupsEnabled()) return null
  const { response } = await fetchWithTimeout({
    url: url.href,
    headers: {},
    requestTimeoutMs: timeout,
    responseTimeoutMs: timeout,
  })
  try {
    throwIfRateLimitedResponse(response, 'https://hn.algolia.com/api/v1/search')
    handleHttpErrors({ response, url: url.href })
    if (!response.ok) throw new Error(`Algolia search failed: ${response.status}`)
    const body: unknown = await response.json()
    if (!isRecord(body) || !Array.isArray(body.hits))
      throw new Error('Invalid Algolia search response')
    return body.hits.slice(0, limit).filter(isRecord)
  } finally {
    cancelResponseBody(response)
  }
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null
}

function nonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function isRecord(value: unknown): value is Hit {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
