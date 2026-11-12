import { nativeUserProfileHeaderApiFixtureCases } from './native-user-profile-header-cases.mts'
import type { ApiFixtureCase } from './types.mts'

const ownerProfile = nativeUserProfileHeaderApiFixtureCases.find(
  c => c.id === 'native.users.profile.default',
)!.body as { user: Record<string, unknown> }

const privateCounts = {
  communities_proxy_following: 2,
  communities_proxy_muted: 1,
  communities_saved: 3,
  domains_blocked: 1,
  domains_muted: 2,
  posts_following: 4,
  posts_hidden: 5,
  posts_saved: 6,
  posts_subscribed: 7,
  rss_feed_items_hidden: 1000,
  rss_feed_items_saved: 1000,
  rss_feed_items_viewed: 8,
  rss_feeds_muted: 9,
  rss_feeds_subscribed: 10,
  rss_feeds_viewed: 11,
  topics_blocked: 12,
  topics_dismissed_recommendations: 13,
  topics_muted: 14,
  topics_subscribed_news: 15,
  topics_subscribed_posts: 16,
  topics_viewed: 1000,
  urls_saved: 17,
  users_blocked: 18,
  users_dismissed_recommendations: 19,
  users_muted: 20,
  users_subscribed_posts: 21,
}
const cappedKeys = new Set(['rss_feed_items_hidden', 'rss_feed_items_saved', 'topics_viewed'])
const privateCountCapped = Object.fromEntries(
  Object.keys(privateCounts).map(key => [key, cappedKeys.has(key)]),
)

export const nativeUserProfilePrivateCountApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.users.profile.private-counts.owner',
    method: 'GET',
    path: '/api/v1/users/alice',
    query: { include_bio: '1' },
    route: {
      routeTemplate: '/api/v1/users/:username',
      pathParams: { username: 'alice' },
    },
    auth: 'fixture-user',
    status: 200,
    backendResponseContractKey: 'GET:/api/v1/users/:idOrSlug#self',
    body: {
      user: { ...ownerProfile.user, markdown: 'Owner view' },
      user_bio_html: '<p>Owner view</p>',
      user_metrics: {
        __entity_type: 'user_metrics',
        id: 'user-abc',
        count: {
          comments: 2,
          discussions: 3,
          reviews: 4,
          users_following: 5,
          users_followers: 6,
          topics_following: 7,
          rss_feeds_following: 8,
          communities_member: 9,
        },
        count_capped: {
          comments: false,
          discussions: false,
          reviews: false,
          users_following: false,
          users_followers: false,
          topics_following: false,
          rss_feeds_following: false,
          communities_member: false,
        },
        private_count: privateCounts,
        private_count_capped: privateCountCapped,
      },
      profile_links: [],
    },
    consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
]
