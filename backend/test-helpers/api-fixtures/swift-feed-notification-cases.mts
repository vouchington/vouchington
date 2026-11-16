import { community, notification, pageInfo, post, user } from './data.mts'
import { electionVotes, postElection } from './election-data.mts'
import { swiftNotification, swiftPost } from './swift-data.mts'
import { swiftUserApiFixtureCases } from './swift-user-cases.mts'
import { nativeFediverseApiFixtureCases } from './native-fediverse-cases.mts'
import { nativeBlueskyApiFixtureCases } from './native-bluesky-cases.mts'
import type { ApiFixtureCase } from './types.mts'

export const swiftFeedNotificationApiFixtureCases: ApiFixtureCase[] = [
  ...nativeFediverseApiFixtureCases,
  ...nativeBlueskyApiFixtureCases,
  {
    id: 'swift.posts.feed.default',
    method: 'GET',
    path: '/api/v1/feeds/posts/any',
    query: { limit: '20', sort: 'hot' },
    route: {
      routeTemplate: '/api/v1/feeds/posts/:feed_type',
      pathParams: { feed_type: 'any' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [{ entity_id: post.id }],
      page_info: pageInfo,
      posts: { [post.id]: swiftPost },
      users: { [user.id]: user },
      communities: { [community.id]: community },
      posts_metrics: {},
      post_elections: { [post.id]: postElection },
      election_votes: { [post.id]: electionVotes[post.id] },
    },
    consumers: ['swift-ui', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUITests.swift',
    ],
  },
  {
    id: 'swift.notifications.default',
    method: 'GET',
    path: '/api/v1/my/notifications',
    query: { limit: '20' },
    route: { routeTemplate: '/api/v1/my/notifications' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        { __entity_type: 'notification', id: notification.id, read_at: null },
        {
          __entity_type: 'notification',
          id: '00000000-0000-7000-8000-000000000101',
          read_at: null,
        },
        {
          __entity_type: 'notification',
          id: '00000000-0000-7000-8000-000000000102',
          read_at: null,
        },
      ],
      page_info: pageInfo,
      notifications: {
        [notification.id]: swiftNotification,
        '00000000-0000-7000-8000-000000000101': {
          ...swiftNotification,
          id: '00000000-0000-7000-8000-000000000101',
          entity_type: 'community_application_decision',
          kind: 'community_application_approved',
          community_id: community.id,
          target_path: null,
          target_entity: { __entity_type: 'community', id: community.id },
        },
        '00000000-0000-7000-8000-000000000102': {
          ...swiftNotification,
          id: '00000000-0000-7000-8000-000000000102',
          entity_type: 'community_activity_digest',
          kind: 'community_activity_digest',
          params: {
            community_count: 1,
            joins: 2,
            departures: 0,
            discussions: 1,
            reviews: 0,
            data_points: 0,
            comments: 3,
            active_posters: 2,
            total_members: 10,
            moderation_workload: 0,
          },
          post_id: null,
          actor_user_id: null,
          target_path: null,
          target_intent: 'notifications_inbox',
        },
      },
      communities: {
        [community.id]: { id: community.id, slug: community.slug, name: community.name },
      },
      actors: { [user.id]: { id: user.id, username: user.username } },
      posts: {
        [post.id]: {
          id: post.id,
          post_type: swiftPost.post_type,
          snippet: post.title,
          actor_user_id: user.id,
          community_id: community.id,
        },
      },
      rss_feed_items: {},
      copyright_notices: {},
      public_texts: {},
    },
    consumers: ['swift-ui', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUITests.swift',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUIWriteTests.swift',
    ],
  },
  {
    id: 'native.notifications.redirect-target.default',
    method: 'GET',
    path: '/api/v1/my/notifications/notification-1/redirect-target',
    route: {
      routeTemplate: '/api/v1/my/notifications/:id/redirect-target',
      pathParams: { id: 'notification-1' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      target_url: '/rss-feed-items/item-1',
    },
    consumers: ['swift-ui', 'dotnet-core'],
    migratedFrom: [],
  },
  ...swiftUserApiFixtureCases,
]
