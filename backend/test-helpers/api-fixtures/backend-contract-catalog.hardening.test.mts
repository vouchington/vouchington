import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'

import { newExpectedParameters } from './query-contract-expected-parameters.mts'

const expectedParameters = {
  'GET:/api/v1/admin/ai-costs': ['after', 'limit'],
  'GET:/api/v1/admin/classifiers': ['after', 'limit'],
  'GET:/api/v1/admin/classifiers/:classifierId/candidates': ['after', 'community_id', 'limit'],
  'GET:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds': [
    'after',
    'limit',
  ],
  'GET:/api/v1/admin/classifiers/:classifierId/human-vote-comparison': [
    'community_id',
    'from',
    'post_id',
    'rss_feed_item_id',
    'to',
  ],
  'GET:/api/v1/admin/moderation-analytics': ['range'],
  'GET:/api/v1/admin/modlog': ['action_type', 'actor_id', 'after', 'community_id', 'limit'],
  'GET:/api/v1/admin/oauth-clients': ['after', 'limit', 'verification'],
  'GET:/api/v1/agent-moderations/:id/votes': ['after', 'limit'],
  'GET:/api/v1/appeals': ['after', 'limit', 'mine', 'status'],
  'GET:/api/v1/auth/passkeys': ['after', 'limit'],
  'GET:/api/v1/auth/sessions': ['after', 'limit'],
  'GET:/api/v1/auth/totp': ['after', 'limit'],
  'GET:/api/v1/communities/:idOrSlug/agent-prompts/history': ['before', 'promptId'],
  'GET:/api/v1/communities/:idOrSlug/moderation-transparency': ['after', 'range'],
  'GET:/api/v1/communities/:idOrSlug/reports/pending': ['after', 'limit', 'sort'],
  'GET:/api/v1/copyright-email-intakes/review-queue': ['after', 'limit'],
  'GET:/api/v1/copyright-notices': ['after', 'limit'],
  'GET:/api/v1/copyright-notices/:id/guest-capabilities': ['after', 'limit'],
  'GET:/api/v1/copyright-notices/:id/targets/:targetId/image-similarity-candidates': ['limit'],
  'GET:/api/v1/copyright-notices/review-queue': ['after', 'limit'],
  'GET:/api/v1/currencies': ['after', 'limit'],
  'GET:/api/v1/disputes': ['after', 'limit', 'mine', 'status'],
  'GET:/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType': [
    'after',
    'limit',
    'minNetVoteScore',
    'positiveNetVoteScore',
    'sort',
    'summary',
  ],
  'GET:/api/v1/entity-relations/:id/votes': ['after', 'limit'],
  'GET:/api/v1/fediverse/search': ['after', 'limit', 'providers', 'q', 'type'],
  'GET:/api/v1/feeds/posts/:feed_type': [
    'after',
    'community',
    'limit',
    'min_score_follow_topics',
    'min_score_follow_users',
    'post_types',
    'q',
    'semantic_search_query',
    'sort',
    'text_search_query',
    'time_range',
  ],
  'GET:/api/v1/feeds/referral_links/:feed_type': ['after', 'limit'],
  'GET:/api/v1/feeds/rss_feed_items/:feed_type': [
    'after',
    'community',
    'has_related_posts',
    'limit',
    'media_type',
    'media_types',
    'min_score_follow_rss_feeds',
    'min_score_follow_topics',
    'q',
    'semantic_search_query',
    'text_search_query',
    'time_range',
  ],
  'GET:/api/v1/growth-metrics': ['range'],
  'GET:/api/v1/hostnames': [
    'after',
    'blocked',
    'crawlable',
    'hostname',
    'include_descendants',
    'limit',
    'query',
    'sort',
    'topic',
    'topic_match',
    'topics',
  ],
  'GET:/api/v1/hostnames/:id/votes': ['after', 'limit'],
  'GET:/api/v1/households': ['access', 'after', 'limit'],
  'GET:/api/v1/households/:id/memberships': ['after', 'limit'],
  'GET:/api/v1/lists': ['after', 'limit'],
  'GET:/api/v1/lists/:id/items': ['after', 'limit', 'media_type', 'read'],
  'GET:/api/v1/memberships/refundable-charges': ['user_id'],
  'GET:/api/v1/moderation-transparency': ['after', 'range'],
  'GET:/api/v1/my/api-keys': ['after', 'limit'],
  'GET:/api/v1/my/bans': ['after', 'limit'],
  'GET:/api/v1/my/cards': ['after', 'limit'],
  'GET:/api/v1/my/communities': ['after', 'limit'],
  'GET:/api/v1/my/contribution-status': ['action'],
  'GET:/api/v1/my/email-addresses': ['after', 'limit'],
  'GET:/api/v1/my/export/rss-feeds': ['feed_type', 'format', 'preflight'],
  'GET:/api/v1/my/export/topics': ['download', 'preflight'],
  'GET:/api/v1/my/friend-recommendations': ['after', 'limit'],
  'GET:/api/v1/my/messages': ['after', 'limit'],
  'GET:/api/v1/my/messages/:conversationId/messages': ['after', 'limit'],
  'GET:/api/v1/my/messages/:conversationId/participants': ['after', 'limit'],
  'GET:/api/v1/my/notifications': ['after', 'limit'],
  'GET:/api/v1/my/notifications/push-subscriptions': ['after', 'limit'],
  'GET:/api/v1/my/oauth-apps': ['after', 'limit'],
  'GET:/api/v1/my/oauth-grants': ['after', 'limit'],
  'GET:/api/v1/my/referral-clicks': ['after', 'limit'],
  'GET:/api/v1/my/removed-posts': ['after', 'include_platform', 'limit'],
  'GET:/api/v1/my/rewards-program-point-valuations': ['after', 'limit'],
  'GET:/api/v1/my/rewards-program-statuses': ['after', 'limit'],
  'GET:/api/v1/my/spending-categories': ['after', 'limit'],
  'GET:/api/v1/my/warnings': ['after', 'limit'],
  'GET:/api/v1/posts': [
    'after',
    'categories',
    'category',
    'creator',
    'data_point_topic',
    'data_point_vertical',
    'drafts',
    'limit',
    'post_types',
    'q',
    'review_topic',
    'semantic_search_query',
    'similar_post',
    'similar_rss_feed_item',
    'similar_topic',
    'sort',
    'story_id',
    'text_search_query',
    'time_range',
    'topic',
    'topics',
    'url',
  ],
  'GET:/api/v1/posts/:id/votes': ['after', 'limit'],
  'GET:/api/v1/posts/:idOrSlug/ancestors': ['after', 'limit'],
  'GET:/api/v1/posts/:idOrSlug/descendants': ['after', 'limit'],
  'GET:/api/v1/posts/review-queue': ['after', 'limit'],
  'GET:/api/v1/referral-link-validations': ['after', 'limit', 'search'],
  'GET:/api/v1/referral-link-validations/:validationId/rules': ['after', 'limit'],
  'GET:/api/v1/referral-links': ['after', 'limit', 'referral_program_id', 'user_id'],
  'GET:/api/v1/reports': ['after', 'before', 'cluster', 'limit', 'sort', 'status'],
  'GET:/api/v1/rss-feed-categories': ['after', 'limit', 'status'],
  'GET:/api/v1/rss-feed-items': [
    'after',
    'category_topic',
    'category_topics',
    'has_related_posts',
    'limit',
    'media_type',
    'media_types',
    'q',
    'read',
    'rss_feed',
    'rss_feeds',
    'semantic_search_query',
    'similar_window_days',
    'story_id',
    'text_search_query',
    'topic',
    'topics',
  ],
  'GET:/api/v1/rss-feed-items/:id/votes': ['after', 'limit'],
  'GET:/api/v1/rss-feeds': [
    'after',
    'apply_mutes',
    'category',
    'discoverable',
    'enabled',
    'feed_type',
    'include_descendants',
    'limit',
    'publisher_type',
    'publisher_type_match',
    'publisher_types',
    'q',
    'text_search_query',
    'topic',
    'topic_match',
    'topics',
  ],
  'GET:/api/v1/rss-feeds/:id/crawls': ['after', 'limit'],
  'GET:/api/v1/rss-feeds/recommended': ['after', 'limit', 'source'],
  'GET:/api/v1/rss-feeds/trending': ['after', 'limit', 'min_score', 'time_range'],
  'GET:/api/v1/stories/:id': ['after', 'exclude_item_id', 'limit'],
  'GET:/api/v1/topic-recommendations/top-hashtags': ['after', 'limit', 'mapping', 'q'],
  'GET:/api/v1/topics': [
    'after',
    'limit',
    'q',
    'rss_feed',
    'semantic_search_query',
    'similar_post',
    'similar_rss_feed_item',
    'similar_topic',
    'slugs',
    'sort',
    'spending_category',
    'text_search_query',
    'topic_types',
  ],
  'GET:/api/v1/topics/:id/prioritized-referral-links': ['all'],
  'GET:/api/v1/topics/:id/votes': ['after', 'limit'],
  'GET:/api/v1/topics/:idOrSlug/additional-hostnames': ['after', 'limit'],
  'GET:/api/v1/topics/:idOrSlug/aliases': ['after', 'limit'],
  'GET:/api/v1/topics/aliases': ['after', 'limit', 'q'],
  'GET:/api/v1/topics/compare': ['slugs'],
  'GET:/api/v1/trending-referral-programs': ['after', 'limit'],
  'GET:/api/v1/urls/:id/crawls': ['after', 'limit'],
  'GET:/api/v1/users': ['after', 'limit', 'q', 'username'],
  'GET:/api/v1/users/:idOrSlug': ['include_bio'],
  'GET:/api/v1/users/:idOrSlug/communities/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/domains/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/posts/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/rss-feed-items/:listType': ['after', 'limit', 'media_type'],
  'GET:/api/v1/users/:idOrSlug/rss-feeds/:listType': ['after', 'feed_type', 'limit'],
  'GET:/api/v1/users/:idOrSlug/topics/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/urls/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/users/:listType': ['after', 'limit', 'q'],
  'GET:/api/v1/users/:userId/mod-notes': ['after', 'limit'],
  'POST:/api/v1/rss-feeds/:id/refreshes': ['force'],
  ...newExpectedParameters,
} as const

const document = JSON.parse(
  readFileSync(new URL('../../../api-fixtures/v1/openapi.json', import.meta.url), 'utf8'),
) as OpenApiDocument
const queryParameters = Object.fromEntries(
  Object.entries(document.paths).flatMap(([route, pathItem]) =>
    Object.entries(pathItem).flatMap(([method, operation]) => {
      const parameters = operation.parameters?.filter(parameter => parameter.in === 'query') ?? []
      return parameters.length
        ? [[`${method.toUpperCase()}:${route.replace(/\{([^}]+)\}/g, ':$1')}`, parameters]]
        : []
    }),
  ),
)

describe('generated backend API query contracts', () => {
  it('publishes exactly the accepted operations and parameter sets', () => {
    expect(Object.keys(queryParameters).toSorted()).toEqual(
      Object.keys(expectedParameters).toSorted(),
    )
    for (const [operation, names] of Object.entries(expectedParameters)) {
      expect(queryParameters[operation]!.map(parameter => parameter.name).toSorted()).toEqual(names)
    }
  })

  it('retains boolean, array, bounded integer and required wire schemas', () => {
    const parameter = (operation: string, name: string) =>
      queryParameters[operation]!.find(candidate => candidate.name === name)!
    expect(parameter('GET:/api/v1/topics/:id/prioritized-referral-links', 'all').schema).toEqual({
      type: 'boolean',
    })
    expect(parameter('POST:/api/v1/rss-feeds/:id/refreshes', 'force').schema).toEqual({
      type: 'boolean',
    })
    expect(parameter('GET:/api/v1/topics/compare', 'slugs')).toMatchObject({
      schema: { type: 'array' },
      style: 'form',
      explode: false,
    })
    expect(parameter('GET:/api/v1/referral-links', 'limit').schema).toMatchObject({
      type: 'integer',
      maximum: 100,
      minimum: 1,
    })
    expect(parameter('GET:/api/v1/rss-feed-items', 'media_type').schema).toMatchObject({
      type: 'array',
    })
    for (const [operation, name] of [
      ['GET:/api/v1/availability', 'kind'],
      ['GET:/api/v1/availability', 'value'],
      ['GET:/api/v1/localization', 'consumer'],
    ])
      expect(parameter(operation, name).required).toBe(true)
  })
})
