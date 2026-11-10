import { SEED_PREFIX, runAndCapture, seedTopicId, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  getCommunityModmailInbox,
  getConversationsByCreatedById,
  getMyDirectConversations,
  getPlatformStats,
  getRevenue,
  getUserBookmarkCounts,
  searchTopicAliases,
  updateTopicRatingStats,
} from '../run-services.mts'
import { runAdminUserSearchScenarios } from './admin-user-search.mts'
import { runDataPointSearchScenarios } from './data-point-search.mts'
import { runUserRemovedPostPageScenarios } from './user-removed-post-pages.mts'
import { runViewDrivenHostnameScenarios } from './view-driven-hostnames.mts'
import { runTopicDataPointInsightsScenario } from './topic-data-point-insights.mts'

export async function runTopicAliasSearchScenarios(): Promise<void> {
  // The alias keyset owns the order; topics are looked up by alias target id before limiting.
  registerScenarioContract('search-topic-aliases', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['topic_aliases_alias_key', 'topics_pkey'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 4_000 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 40 },
    ],
  })
  const firstAliasPage = await searchTopicAliases({ prefixQuery: 'seed', limit: 25 })
  await runAndCapture('search-topic-aliases', () =>
    searchTopicAliases({ prefixQuery: 'seed', limit: 25 }),
  )
  if (firstAliasPage.hasNextPage && firstAliasPage.endAlias) {
    registerScenarioContract('search-topic-aliases-cursor', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['topic_aliases_alias_key', 'topics_pkey'],
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 4_000 },
        { kind: 'maxProcessedRows', relation: 'topics', max: 40 },
      ],
    })
    await runAndCapture('search-topic-aliases-cursor', () =>
      searchTopicAliases({ prefixQuery: 'seed', limit: 25, after: firstAliasPage.endAlias! }),
    )
  }
  registerScenarioContract('search-topic-aliases-unfiltered', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['topic_aliases_alias_key', 'topics_pkey'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 4_000 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 40 },
    ],
  })
  await runAndCapture('search-topic-aliases-unfiltered', () => searchTopicAliases({ limit: 25 }))
}

export async function runEntityTailScenarios(): Promise<void> {
  await runTopicDataPointInsightsScenario()

  await runAndCapture('topic-rating-stats', () => updateTopicRatingStats(seedTopicId))

  await runViewDrivenHostnameScenarios()

  await runAdminUserSearchScenarios()

  await runTopicAliasSearchScenarios()

  await runDataPointSearchScenarios()

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
