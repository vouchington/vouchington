import type { ApiFixtureCase } from './types.mts'

export const nativeUserRestrictedProfileApiFixtureCase: ApiFixtureCase = {
  id: 'native.users.profile.restricted',
  method: 'GET',
  path: '/api/v1/users/restricted',
  query: { include_bio: '1' },
  route: {
    routeTemplate: '/api/v1/users/:idOrSlug',
    pathParams: { idOrSlug: 'restricted' },
  },
  auth: 'none',
  status: 200,
  body: {
    user: {
      __entity_type: 'user',
      account_type: null,
      id: 'user-restricted',
      username: 'restricted',
      profile_image_id: '00000000-0000-7000-8000-000000000201',
      profile_image_placement: {
        image_id: '00000000-0000-7000-8000-000000000201',
        placement_id: '00000000-0000-7000-8000-000000000303',
        placement_revision: 0,
      },
      markdown: 'Private collections',
      roles: ['user'],
    },
    user_bio_html: '<p>Private collections</p>',
    user_metrics: {
      __entity_type: 'user_metrics',
      id: 'user-restricted',
      count: {
        comments: 2,
        discussions: 3,
        reviews: 4,
        users_following: 0,
        users_followers: 0,
        topics_following: 0,
        rss_feeds_following: 0,
        communities_member: 0,
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
      bookmarks: {
        follow: { topics: 0, posts: 0, users: 0 },
      },
      bookmarks_capped: {
        follow: { topics: false, posts: false, users: false },
      },
      bookmarkers: { follow: 0 },
      bookmarkers_capped: { follow: false },
      bookmarks__updated_at: '2026-07-01T16:00:00Z',
    },
    profile_links: [],
  },
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: [],
}
