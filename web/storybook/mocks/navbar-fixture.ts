import { ClientRequest } from '@/lib/api/client/request'
import { communities } from '@/storybook/entities/fixtures/communities'
import { newsItems } from '@/storybook/entities/fixtures/feeds'
import { hostnamesResponse } from '@/storybook/entities/fixtures/hostnames'
import { postsResponse } from '@/storybook/entities/fixtures/posts'
import { topicsResponse } from '@/storybook/entities/fixtures/topics'

let navbarFixture = false
const previousGet = ClientRequest.prototype.get
const previousPost = ClientRequest.prototype.post
const page = { has_next_page: false, end_cursor: null, start_cursor: null }
const community = communities[0]!
const newsItem = newsItems[0]!

const searchPages: Record<string, unknown> = {
  '/api/v1/topics': topicsResponse,
  '/api/v1/posts': postsResponse,
  '/api/v1/hostnames': hostnamesResponse,
  '/api/v1/rss-feed-items': {
    results: [{ __entity_type: 'rss_feed_item', id: newsItem.id }],
    page_info: page,
    rss_feed_items: { [newsItem.id]: newsItem },
  },
  '/api/v1/communities': {
    results: [{ __entity_type: 'community', id: community.id }],
    page_info: page,
    communities: {
      [community.id]: {
        __entity_type: 'community',
        id: community.id,
        name: community.name,
        slug: community.slug,
        markdown: community.description_markdown,
        visibility: community.visibility,
      },
    },
  },
}

const searchMapKey: Record<string, string> = {
  '/api/v1/topics': 'topics',
  '/api/v1/posts': 'posts',
  '/api/v1/hostnames': 'hostnames',
  '/api/v1/rss-feed-items': 'rss_feed_items',
  '/api/v1/communities': 'communities',
}

function searchQuery(options?: Parameters<ClientRequest['get']>[1]): string {
  const query = options?.searchParams?.q
  return typeof query === 'string' ? query.trim().toLowerCase() : ''
}

function filterSearchPage(body: unknown, mapKey: string, query: string): unknown {
  if (!query || typeof body !== 'object' || body === null) return body
  const record = body as Record<string, unknown>
  const entities = record[mapKey]
  if (typeof entities !== 'object' || entities === null) return body
  const kept = Object.entries(entities as Record<string, unknown>).filter(([, entity]) =>
    JSON.stringify(entity).toLowerCase().includes(query),
  )
  const ids = new Set(kept.map(([id]) => id))
  const results = Array.isArray(record.results)
    ? record.results.filter(
        result =>
          typeof result === 'object' &&
          result !== null &&
          'id' in result &&
          ids.has(String(result.id)),
      )
    : record.results
  return { ...record, results, [mapKey]: Object.fromEntries(kept) }
}

export function setNavbarFixture(): void {
  navbarFixture = true
}

export function clearNavbarFixture(): void {
  navbarFixture = false
}

ClientRequest.prototype.get = function storybookNavbarGet<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['get']>[1],
): Promise<T> {
  const pageBody = navbarFixture ? searchPages[endpoint] : undefined
  if (pageBody !== undefined) {
    const mapKey = searchMapKey[endpoint]
    return Promise.resolve(
      (mapKey ? filterSearchPage(pageBody, mapKey, searchQuery(options)) : pageBody) as T,
    )
  }
  return previousGet.call(this, endpoint, options) as Promise<T>
}

ClientRequest.prototype.post = function storybookNavbarPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  if (navbarFixture && endpoint === '/api/v1/auth/logout') return Promise.resolve({} as T)
  return previousPost.call(this, endpoint, body, options) as Promise<T>
}
