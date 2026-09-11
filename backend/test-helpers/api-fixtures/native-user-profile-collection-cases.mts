import { community, pageInfo, topic } from './data.mts'
import { swiftRssFeedSource } from './swift-data.mts'
import type { ApiFixtureCase } from './types.mts'

const timestampCursor =
  'eyJ0aW1lc3RhbXAiOjE3ODI5MjE2MDAwMDAwMDAsImlkIjoiMDAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAxIn0'
const membershipCursor = 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMiJ9'
const firstPage = (endCursor: string) => ({
  has_next_page: true,
  start_cursor: endCursor,
  end_cursor: endCursor,
})
const communityWithOwner = { ...community, owner: null }

export const nativeUserProfileCollectionApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.users.profile.topics-following.first-page',
    method: 'GET',
    path: '/api/v1/users/user-abc/topics/following',
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/topics/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'following' },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [topic], page_info: firstPage(timestampCursor) },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.topics-following.next-page',
    method: 'GET',
    path: '/api/v1/users/user-abc/topics/following',
    query: { limit: '25', after: timestampCursor },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/topics/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'following' },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: pageInfo },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.sources-following.article',
    method: 'GET',
    path: '/api/v1/users/user-abc/rss-feeds/following',
    query: { limit: '25', feed_type: 'article' },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/rss-feeds/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'following' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [swiftRssFeedSource],
      page_info: firstPage(timestampCursor),
      bookmarks: { [swiftRssFeedSource.id]: { follow: true } },
      topic_elections: {},
      hostname_elections: {},
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.communities-member.first-page',
    method: 'GET',
    path: '/api/v1/users/user-abc/communities/member',
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/communities/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'member' },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [communityWithOwner], page_info: firstPage(membershipCursor) },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  {
    id: 'native.users.profile.communities-member.next-page',
    method: 'GET',
    path: '/api/v1/users/user-abc/communities/member',
    query: { limit: '25', after: membershipCursor },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/communities/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'member' },
    },
    auth: 'fixture-user',
    status: 200,
    body: { results: [], page_info: pageInfo },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
]
