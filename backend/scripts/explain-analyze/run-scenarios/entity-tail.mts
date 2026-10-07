import { SEED_PREFIX, runAndCapture, seedTopicId, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import * as services from '../run-services.mts'
import { runAdminUserSearchScenarios } from './admin-user-search.mts'

const {
  getCommunityModmailInbox,
  getConversationsByCreatedById,
  getMyDirectConversations,
  getPlatformStats,
  getTopicDataPointInsights,
  getUserBookmarkCounts,
  listUserRemovedPosts,
  searchDataPoints,
  searchTopHostnames,
  searchTopicAliases,
  updateTopicRatingStats,
} = services

export async function runEntityTailScenarios(): Promise<void> {
  await runAndCapture('topic-data-point-insights', () => getTopicDataPointInsights(seedTopicId))

  await runAndCapture('topic-rating-stats', () => updateTopicRatingStats(seedTopicId))

  await runAndCapture('search-top-hostnames', () => searchTopHostnames({ limit: 25 }))

  // Top hostnames filtered by topic
  await runAndCapture('search-top-hostnames-by-topic', () =>
    searchTopHostnames({ topic_id: seedTopicId, limit: 25 }),
  )

  await runAdminUserSearchScenarios()

  // Topic alias search — autocomplete prefix query
  await runAndCapture('search-topic-aliases', () =>
    searchTopicAliases({ prefixQuery: 'seed', limit: 25 }),
  )

  // Data point search — JSONB + EXISTS subquery
  await runAndCapture('search-data-points', () =>
    searchDataPoints({ topic_id: seedTopicId, limit: 25 }),
  )

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
  registerScenarioContract('user-removed-posts-page', {
    expectations: [
      { kind: 'custom', name: 'userRemovedPosts' },
      { kind: 'usesIndexes', indexes: ['idx_posts__default__created_by_rejected_at_id'] },
    ],
  })
  await runAndCapture('user-removed-posts-page', () =>
    listUserRemovedPosts(seedUser.id, { includePlatform: true, limit: 25 }),
  )

  // Platform stats — 6 scalar COUNT subqueries
  await runAndCapture('platform-stats', () => getPlatformStats())
}
