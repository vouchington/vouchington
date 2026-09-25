import { pageInfo, topic } from './data.mts'
import { electionVotes, topicElection } from './election-data.mts'
import { rssFeedItemsFeedBody } from './rss-feed-items-data.mts'
import type { ApiFixtureCase } from './types.mts'
import { webCommunityApiFixtureCases } from './web-community-cases.mts'
import { webCommunityModerationApiFixtureCases } from './web-community-moderation-cases.mts'
import { growthMetricsBody } from './web-growth-metrics-data.mts'
import { webMembershipRefundApiFixtureCases } from './web-membership-refund-cases.mts'

export const webApiFixtureCases: ApiFixtureCase[] = [
  ...webMembershipRefundApiFixtureCases,
  {
    id: 'web.oauth.authorization.complete.acknowledged',
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    route: {
      routeTemplate: '/api/v1/auth/oauth/authorizations/:flowId/complete',
      pathParams: { flowId: '019fafb8-a44c-73e2-890a-497ff3dd27a6' },
    },
    backendResponseContractKey:
      'POST:/api/v1/auth/oauth/authorizations/:flowId/complete#acknowledged',
    auth: 'fixture-user',
    status: 204,
    requestBody: { acknowledge: true },
    body: null,
    consumers: ['web'],
    migratedFrom: ['web/app/auth/callback/broker/page.tsx', 'web/lib/api/client/auth.ts'],
  },
  {
    id: 'shared.currencies.list.default',
    method: 'GET',
    path: '/api/v1/currencies',
    route: { routeTemplate: '/api/v1/currencies' },
    auth: 'none',
    status: 200,
    body: {
      results: [
        { code: 'aud', minor_unit_exponent: 2 },
        { code: 'cad', minor_unit_exponent: 2 },
        { code: 'eur', minor_unit_exponent: 2 },
        { code: 'gbp', minor_unit_exponent: 2 },
        { code: 'jpy', minor_unit_exponent: 0 },
        { code: 'usd', minor_unit_exponent: 2 },
      ],
      page_info: {
        has_next_page: false,
        start_cursor: 'currency-aud-cursor',
        end_cursor: null,
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/currencies/currencies.mts'],
  },
  ...webCommunityApiFixtureCases,
  ...webCommunityModerationApiFixtureCases,
  {
    id: 'web.growth-metrics.default',
    method: 'GET',
    path: '/api/v1/growth-metrics',
    route: { routeTemplate: '/api/v1/growth-metrics' },
    query: { range: '30d' },
    auth: 'fixture-user',
    status: 200,
    body: growthMetricsBody,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/admin/growth-metrics/README.md'],
  },
  {
    id: 'web.topics.search.default',
    method: 'GET',
    path: '/api/v1/topics',
    route: { routeTemplate: '/api/v1/topics' },
    query: { q: 'tech' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [
        {
          __entity_type: 'topic',
          id: topic.id,
          name: topic.name,
          slug: topic.slug,
          topic_type: topic.topic_type,
        },
      ],
      page_info: pageInfo,
      topics: { [topic.id]: topic },
      topic_elections: { [topic.id]: topicElection },
      election_votes: { [topic.id]: electionVotes[topic.id] },
      topics_metrics: {},
    },
    consumers: ['web', 'dotnet-core'],
    migratedFrom: ['web/test-helpers/api-responses/topics.ts'],
  },
  {
    id: 'web.topics.mutation.default',
    method: 'POST',
    path: '/api/v1/topics',
    route: { routeTemplate: '/api/v1/topics' },
    requestBody: { name: 'Tech', slug: 'tech', topic_type: 'topic' },
    auth: 'fixture-user',
    status: 201,
    body: {
      topic: {
        ...topic,
        logo_image_id: 'topic-logo-image-1',
        logo_image_placement: {
          placement_id: 'placement-topic-logo-image-1',
          placement_revision: 3,
          image_id: 'topic-logo-image-1',
        },
        hero_image_id: 'topic-hero-image-1',
        hero_image_placement: {
          placement_id: 'placement-topic-hero-image-1',
          placement_revision: 4,
          image_id: 'topic-hero-image-1',
        },
      },
    },
    consumers: ['web', 'dotnet-core'],
    migratedFrom: ['web/test-helpers/api-responses/topics.ts'],
  },
  {
    id: 'web.rss-feed-items.feed.default',
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    route: {
      routeTemplate: '/api/v1/feeds/rss_feed_items/:feed_type',
      pathParams: { feed_type: 'any' },
    },
    query: { limit: '25', media_type: 'article' },
    auth: 'fixture-user',
    status: 200,
    body: rssFeedItemsFeedBody,
    consumers: ['web', 'dotnet-core'],
    migratedFrom: ['web/test-helpers/api-responses/rss-feed-items.ts'],
  },
]
