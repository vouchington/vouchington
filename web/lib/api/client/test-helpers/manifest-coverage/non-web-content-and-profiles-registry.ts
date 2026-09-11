import { endpoint, type ManifestEndpoint } from './endpoint-registry'

export const contentAndProfilesEndpointRegistry = {
  'native.comments.post-detail.default': { method: 'GET', path: '/api/v1/posts/comment-root' },
  'native.comments.descendants.default': {
    method: 'GET',
    path: '/api/v1/posts/comment-root-post/descendants',
    query: { after: 'fixture-root-and-subtree-scoped-cursor', limit: '2' },
  },
  'native.comments.ancestors.permalink': {
    method: 'GET',
    path: '/api/v1/posts/comment-b/ancestors',
  },
  'native.comments.ancestors.bounded.shallow': {
    method: 'GET',
    path: '/api/v1/posts/comment-b/ancestors',
    query: { limit: '5' },
  },
  'native.comments.ancestors.bounded.deep-initial': {
    method: 'GET',
    path: '/api/v1/posts/bounded-ancestor-comment-7/ancestors',
    query: { limit: '5' },
  },
  'native.comments.ancestors.bounded.deep-continuation': {
    method: 'GET',
    path: '/api/v1/posts/bounded-ancestor-comment-7/ancestors',
    query: { after: 'fixture-ancestor-deep-initial-end', limit: '5' },
  },
  'native.lists.default': { method: 'GET', path: '/api/v1/lists', query: { limit: '25' } },
  'native.list-items.default': {
    method: 'GET',
    path: '/api/v1/lists/list-1/items',
    query: { limit: '25' },
  },
  'native.lists-containing.default': {
    method: 'GET',
    path: '/api/v1/lists/contains',
    query: { entity_id: 'item-1', item_type: 'rss_feed_item' },
  },
  'native.list-import.default': {
    method: 'POST',
    path: '/api/v1/lists/list-1/import',
    requestBody: { community_slug: 'test-community' },
  },
  'native.landing-pages.default': { method: 'GET', path: '/api/v1/my/landing-pages' },
  'native.landing-page-detail.default': {
    method: 'GET',
    path: '/api/v1/my/landing-pages/landing-page-1',
  },
  'native.landing-page-analytics.default': {
    method: 'GET',
    path: '/api/v1/my/landing-pages/landing-page-1/analytics',
  },
  'native.admin-user-landing-pages.default': {
    method: 'GET',
    path: '/api/v1/admin/users/user-abc/landing-pages',
  },
  'native.admin-landing-page-analytics.default': {
    method: 'GET',
    path: '/api/v1/admin/landing-pages/landing-page-1/analytics',
  },
  'native.landing-page-candidates.default': {
    method: 'GET',
    path: '/api/v1/my/landing-pages/candidates',
  },
  'native.landing-page-mutation.default': {
    method: 'PATCH',
    path: '/api/v1/my/landing-pages/landing-page-1',
    requestBody: { slug: 'updated-links', title: 'Updated Links' },
  },
  'native.users.profile.default': {
    method: 'GET',
    path: '/api/v1/users/alice',
    query: { include_bio: '1' },
  },
  'native.users.profile.restricted': endpoint('/api/v1/users/restricted', {
    include_bio: '1',
  }),
  'native.users.vouch-context.default': endpoint('/api/v1/users/user-abc/vouch-context'),
  'native.users.profile.posts.all': endpoint('/api/v1/posts', {
    creator: 'user-abc',
    limit: '25',
    post_types: 'review,discussion,comment',
    sort: 'new',
  }),
  'native.users.profile.posts.reviews': endpoint('/api/v1/posts', {
    creator: 'user-abc',
    limit: '25',
    post_types: 'review',
    sort: 'new',
  }),
  'native.users.profile.posts.discussions': endpoint('/api/v1/posts', {
    creator: 'user-abc',
    limit: '25',
    post_types: 'discussion',
    sort: 'new',
  }),
  'native.users.profile.posts.comments': endpoint('/api/v1/posts', {
    creator: 'user-abc',
    limit: '25',
    post_types: 'comment',
    sort: 'new',
  }),
  'native.users.profile.topics-following.first-page': endpoint(
    '/api/v1/users/user-abc/topics/following',
    { limit: '25' },
  ),
  'native.users.profile.topics-following.next-page': endpoint(
    '/api/v1/users/user-abc/topics/following',
    {
      after:
        'eyJ0aW1lc3RhbXAiOjE3ODI5MjE2MDAwMDAwMDAsImlkIjoiMDAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAxIn0',
      limit: '25',
    },
  ),
  'native.users.profile.sources-following.article': endpoint(
    '/api/v1/users/user-abc/rss-feeds/following',
    { feed_type: 'article', limit: '25' },
  ),
  'native.users.profile.communities-member.first-page': endpoint(
    '/api/v1/users/user-abc/communities/member',
    { limit: '25' },
  ),
  'native.users.profile.communities-member.next-page': endpoint(
    '/api/v1/users/user-abc/communities/member',
    {
      after: 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMiJ9',
      limit: '25',
    },
  ),
} satisfies Record<string, ManifestEndpoint>
