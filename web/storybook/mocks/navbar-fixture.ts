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
  if (pageBody !== undefined) return Promise.resolve(pageBody as T)
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
