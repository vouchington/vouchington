import { SEED_PREFIX, runAndCapture, seedTopicId, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import * as services from '../run-services.mts'
import { runAdminUserSearchScenarios } from './admin-user-search.mts'
import { runUserRemovedPostPageScenarios } from './user-removed-post-pages.mts'
import { runViewDrivenHostnameScenarios } from './view-driven-hostnames.mts'

const {
  getCommunityModmailInbox,
  getConversationsByCreatedById,
  getMyDirectConversations,
  getPlatformStats,
  getRevenue,
  getTopicDataPointInsights,
  getUserBookmarkCounts,
  searchDataPoints,
  searchTopicAliases,
  updateTopicRatingStats,
} = services

export async function runEntityTailScenarios(): Promise<void> {
  await runAndCapture('topic-data-point-insights', () => getTopicDataPointInsights(seedTopicId))

  await runAndCapture('topic-rating-stats', () => updateTopicRatingStats(seedTopicId))

  await runViewDrivenHostnameScenarios()

  await runAdminUserSearchScenarios()

  // Prefix ILIKE is not served by text_pattern_ops; the page cap is the alias table, and topics stay a lookup.
  registerScenarioContract('search-topic-aliases', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 4_000 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 40 },
    ],
  })
  await runAndCapture('search-topic-aliases', () =>
    searchTopicAliases({ prefixQuery: 'seed', limit: 25 }),
  )

  // Data point search — JSONB + EXISTS subquery
  registerScenarioContract('search-data-points', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'communities', max: 200 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 20000 },
    ],
    crossPartition: {
      posts: 'A data-point page reads child posts that can sit in more than one id partition.',
    },
  })
  await runAndCapture('search-data-points', () =>
    searchDataPoints({ topic_id: seedTopicId, limit: 25 }),
  )
  registerScenarioContract('search-data-points-live-page', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'communities', max: 80 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 2000 },
      { kind: 'usesIndexes', indexes: ['idx_communities__live_public_id'] },
    ],
    crossPartition: {
      posts: 'A data-point page reads child posts that can sit in more than one id partition.',
    },
  })
  await runAndCapture('search-data-points-live-page', () => searchDataPoints({ limit: 25 }))

  // User bookmark counts — dynamic UNION ALL of COUNT queries across bookmark tables
  await runAndCapture('user-bookmark-counts', () => getUserBookmarkCounts(seedUser.id))

  // Conversations list by user
  await runAndCapture('conversations-by-user', () =>
    getConversationsByCreatedById(seedUser.id, { limit: 25 }),
  )
  registerScenarioContract('direct-message-inbox-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_conversations__direct_message_activity'],
        noSort: true,
      },
    ],
  })
  await runAndCapture('direct-message-inbox-page', () =>
    getMyDirectConversations(seedUser.id, {
      after: {
        timestamp: '2026-01-01T00:08:20.000000Z',
        id: `${SEED_PREFIX}-0c00-7000-8000-0000000001f4`,
      },
      limit: 25,
    }),
  )
  registerScenarioContract('modmail-inbox-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_conversations__modmail_community_activity'],
        noSort: true,
      },
    ],
  })
  await runAndCapture('modmail-inbox-page', () =>
    getCommunityModmailInbox(`${SEED_PREFIX}-1400-7000-8000-000000000000`, {
      after: {
        timestamp: '2026-01-01T00:08:20.000000Z',
        id: `${SEED_PREFIX}-0d00-7000-8000-0000000001f4`,
      },
      limit: 25,
    }),
  )
  await runUserRemovedPostPageScenarios()

  // Platform stats — 6 scalar COUNT subqueries
  registerScenarioContract('platform-stats', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'mv_platform_stats', max: 1 }],
  })
  await runAndCapture('platform-stats', () => getPlatformStats())
  registerScenarioContract('revenue-global', {
    expectations: [
      // The 302-row fixture is small enough for two sequential scans (2 × 302, plus 20%).
      { kind: 'maxProcessedRows', relation: 'mv_revenue_memberships', max: 725 },
      { kind: 'maxProcessedRows', relation: 'mv_revenue_changes', max: 12 },
    ],
  })
  await runAndCapture('revenue-global', () => getRevenue('7d', new Date(Date.now() - 7 * 86400000)))
  registerScenarioContract('revenue-scoped', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'mv_revenue_memberships', max: 725 },
      { kind: 'maxProcessedRows', relation: 'mv_revenue_changes', max: 12 },
    ],
  })
  await runAndCapture('revenue-scoped', () =>
    getRevenue('7d', new Date(Date.now() - 7 * 86400000), { userIds: [seedUser.id] }),
  )
}
