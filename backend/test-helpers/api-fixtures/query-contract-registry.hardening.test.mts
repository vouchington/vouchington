import { beforeAll, describe, expect, it } from 'vitest'

import { loadBackendQueryContracts } from './query-contract-registry.mts'
import { COLD_BACKEND_PROGRAM_TIMEOUT_MS } from './cold-build-budget.mts'
import { getBackendProgramBuildCount, getBackendProgramEntryCount } from './backend-program.mts'

const expectedParameters = {
  'GET:/api/v1/admin/ai-costs': ['after', 'limit'],
  'GET:/api/v1/agent-moderations/:id/votes': ['after', 'limit'],
  'GET:/api/v1/auth/passkeys': ['after', 'limit'],
  'GET:/api/v1/auth/sessions': ['after', 'limit'],
  'GET:/api/v1/auth/totp': ['after', 'limit'],
  'GET:/api/v1/communities/:idOrSlug/moderation-transparency': ['after', 'range'],
  'GET:/api/v1/communities/:idOrSlug/reports/pending': ['after', 'limit', 'sort'],
  'GET:/api/v1/currencies': ['after', 'limit'],
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
  'GET:/api/v1/moderation-transparency': ['after', 'range'],
  'GET:/api/v1/my/api-keys': ['after', 'limit'],
  'GET:/api/v1/my/communities': ['after', 'limit'],
  'GET:/api/v1/my/email-addresses': ['after', 'limit'],
  'GET:/api/v1/my/friend-recommendations': ['after', 'limit'],
  'GET:/api/v1/my/notifications/push-subscriptions': ['after', 'limit'],
  'GET:/api/v1/my/rewards-program-point-valuations': ['after', 'limit'],
  'GET:/api/v1/my/rewards-program-statuses': ['after', 'limit'],
  'GET:/api/v1/my/spending-categories': ['after', 'limit'],
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
  'GET:/api/v1/posts/:postId/agents/:agentId/responses': ['after', 'limit'],
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
  'GET:/api/v1/support/contacts': ['after', 'limit', 'q'],
  'GET:/api/v1/support/contacts/:contactId': ['after', 'limit'],
  'GET:/api/v1/support/threads': ['after', 'limit', 'q', 'status'],
  'GET:/api/v1/support/threads/:threadId/messages': ['after', 'limit'],
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
  'GET:/api/v1/topics/:id/votes': ['after', 'limit'],
  'GET:/api/v1/topics/:idOrSlug/additional-hostnames': ['after', 'limit'],
  'GET:/api/v1/topics/:idOrSlug/aliases': ['after', 'limit'],
  'GET:/api/v1/topics/aliases': ['after', 'limit'],
  'GET:/api/v1/users': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/communities/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/domains/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/posts/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/rss-feed-items/:listType': ['after', 'limit', 'media_type'],
  'GET:/api/v1/users/:idOrSlug/topics/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/urls/:listType': ['after', 'limit'],
  'GET:/api/v1/users/:idOrSlug/users/:listType': ['after', 'limit', 'q'],
  'GET:/api/v1/users/:userId/mod-notes': ['after', 'limit'],
} as const

const acceptedOperations = new Set(Object.keys(expectedParameters))

let contracts: ReturnType<typeof loadBackendQueryContracts>
let buildCountAfterHoist: number
let entryCountAfterHoist: number

describe('real backend API query contracts', () => {
  beforeAll(() => {
    // Build once here — tests below read this closure instead of re-entering the loader.
    contracts = loadBackendQueryContracts(acceptedOperations)
    buildCountAfterHoist = getBackendProgramBuildCount()
    entryCountAfterHoist = getBackendProgramEntryCount()
  }, COLD_BACKEND_PROGRAM_TIMEOUT_MS)

  it('publishes exactly the accepted operations and parameter sets', () => {
    expect(Object.keys(contracts)).toEqual(Object.keys(expectedParameters))
    for (const [operation, names] of Object.entries(expectedParameters)) {
      expect(Object.keys(contracts[operation]!.parameters).toSorted()).toEqual(names)
    }
  })

  it(
    'does not reuse a permissive known-route cache entry for a stricter route set',
    () => {
      expect(Object.keys(contracts)).toHaveLength(Object.keys(expectedParameters).length)
      // Deliberate cacheKey miss (empty route set) forces a fresh discovery pass — needs its own budget.
      expect(() => loadBackendQueryContracts(new Set())).toThrow(
        'apiQuery references unknown response route',
      )
    },
    COLD_BACKEND_PROGRAM_TIMEOUT_MS,
  )

  it('never re-enters loadBackendProgram() beyond the hoist and the single intentional rebuild', () => {
    expect(getBackendProgramEntryCount()).toBe(entryCountAfterHoist + 1)
    expect(getBackendProgramBuildCount()).toBe(buildCountAfterHoist)
  })
})
