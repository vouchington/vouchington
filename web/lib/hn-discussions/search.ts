import { clientFetch } from '@/lib/api/client/raw-fetch'
import { normalizeHnDiscussionUrl } from './normalize-url'

export const HN_ALGOLIA_SEARCH_ORIGIN = 'https://hn.algolia.com'
export const HN_ITEM_URL = 'https://news.ycombinator.com/item'

export interface HnDiscussionThread {
  objectID: string
  title: string
  score: number
  commentCount: number
  itemUrl: string
}

interface HnAlgoliaHit {
  objectID?: unknown
  title?: unknown
  url?: unknown
  points?: unknown
  num_comments?: unknown
}

interface HnAlgoliaSearchResponse {
  hits?: HnAlgoliaHit[]
}

const inflightByNormalizedUrl = new Map<string, Promise<HnDiscussionThread[]>>()

export function buildHnAlgoliaSearchUrl(pageUrl: string): string {
  const params = new URLSearchParams({
    query: pageUrl,
    restrictSearchableAttributes: 'url',
    tags: 'story',
    hitsPerPage: '5',
  })
  return `${HN_ALGOLIA_SEARCH_ORIGIN}/api/v1/search?${params}`
}

export function mapHnAlgoliaHits(
  hits: HnAlgoliaHit[] | undefined,
  sourceUrl: string,
): HnDiscussionThread[] {
  const expected = normalizeHnDiscussionUrl(sourceUrl)
  if (!expected) return []
  const threads: HnDiscussionThread[] = []
  for (const hit of hits ?? []) {
    const thread = toThread(hit, expected)
    if (thread) threads.push(thread)
  }
  return threads
}

export async function searchHnDiscussionsForUrl(pageUrl: string): Promise<HnDiscussionThread[]> {
  const key = normalizeHnDiscussionUrl(pageUrl) ?? pageUrl
  const existing = inflightByNormalizedUrl.get(key)
  if (existing) return existing
  const request = fetchHnDiscussions(pageUrl).finally(() => {
    inflightByNormalizedUrl.delete(key)
  })
  inflightByNormalizedUrl.set(key, request)
  return request
}

export async function searchHnDiscussionsForUrls(
  pageUrls: readonly string[],
): Promise<HnDiscussionThread[]> {
  const groups = await Promise.all(pageUrls.map(url => searchHnDiscussionsForUrl(url)))
  const seen = new Set<string>()
  const threads: HnDiscussionThread[] = []
  for (const group of groups) {
    for (const thread of group) {
      if (seen.has(thread.objectID)) continue
      seen.add(thread.objectID)
      threads.push(thread)
    }
  }
  return threads
}

async function fetchHnDiscussions(pageUrl: string): Promise<HnDiscussionThread[]> {
  try {
    const response = await clientFetch(buildHnAlgoliaSearchUrl(pageUrl))
    if (!response.ok) return []
    const body = (await response.json()) as HnAlgoliaSearchResponse
    return mapHnAlgoliaHits(body.hits, pageUrl)
  } catch {
    return []
  }
}

function toThread(hit: HnAlgoliaHit, expectedNormalizedUrl: string): HnDiscussionThread | null {
  if (typeof hit.objectID !== 'string' || hit.objectID.length === 0) return null
  if (typeof hit.title !== 'string' || hit.title.trim().length === 0) return null
  if (typeof hit.url !== 'string') return null
  const hitUrl = normalizeHnDiscussionUrl(hit.url)
  if (hitUrl !== expectedNormalizedUrl) return null
  const score = typeof hit.points === 'number' && Number.isFinite(hit.points) ? hit.points : 0
  const commentCount =
    typeof hit.num_comments === 'number' && Number.isFinite(hit.num_comments) ? hit.num_comments : 0
  return {
    objectID: hit.objectID,
    title: hit.title.trim(),
    score,
    commentCount,
    itemUrl: `${HN_ITEM_URL}?id=${encodeURIComponent(hit.objectID)}`,
  }
}
