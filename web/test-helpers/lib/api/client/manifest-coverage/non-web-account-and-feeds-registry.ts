import { endpoint, type ManifestEndpoint } from './endpoint-registry'

export const accountAndFeedsEndpointRegistry = {
  'native.referral-links.mine.default': {
    method: 'GET',
    path: '/api/v1/referral-links',
    query: { limit: '25' },
  },
  'native.referral-clicks.mine.default': {
    method: 'GET',
    path: '/api/v1/my/referral-clicks',
    query: { limit: '25' },
  },
  'swift.posts.feed.default': {
    method: 'GET',
    path: '/api/v1/feeds/posts/any',
    query: { limit: '20', sort: 'hot' },
  },
  'swift.notifications.default': endpoint('/api/v1/my/notifications', { limit: '20' }),
  'native.notifications.redirect-target.default': endpoint(
    '/api/v1/my/notifications/notification-1/redirect-target',
  ),
  'swift.users.following.default': {
    method: 'GET',
    path: '/api/v1/users/user-abc/users/following',
    query: { limit: '100' },
  },
  'swift.users.followers.default': {
    method: 'GET',
    path: '/api/v1/users/user-abc/users/followers',
    query: { limit: '100' },
  },
  'swift.my.identity.default': { method: 'GET', path: '/api/v1/my/identity' },
  'native.my.email-preferences.default': {
    method: 'GET',
    path: '/api/v1/my/email-preferences',
  },
  'native.my.email-addresses.empty': {
    method: 'GET',
    path: '/api/v1/my/email-addresses',
    query: { after: 'fixture-owner-scoped-email-cursor', limit: '1' },
  },
  'native.my.email-addresses.request.default': {
    method: 'POST',
    path: '/api/v1/my/email-addresses',
    requestBody: { email_address: ' Tests+Native-User@Voucha.ai ' },
  },
  'native.my.email-addresses.verify.default': {
    method: 'POST',
    path: '/api/v1/my/email-addresses/tests%2Bnative-user%40voucha.ai/verifications',
    requestBody: { token: 'ABCD1234' },
  },
  'swift.my.profile.default': { method: 'GET', path: '/api/v1/my/profile' },
  'swift.rss-feeds.default': endpoint('/api/v1/rss-feeds', { limit: '25' }),
  'swift.rss-feed-items.feed.default': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    query: { limit: '20', media_type: 'video' },
  },
  'swift.integration.rss-feed-items.video': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    query: { limit: '20', media_type: 'video' },
  },
  'swift.integration.rss-feed-items.audio': {
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    query: { limit: '20', media_type: 'audio' },
  },
  'swift.podcast-playback-position.default': {
    method: 'GET',
    path: '/api/v1/podcast-episodes/episode-1/playback-position',
  },
} satisfies Record<string, ManifestEndpoint>
