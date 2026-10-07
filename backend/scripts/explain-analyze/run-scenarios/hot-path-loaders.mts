import { read } from '@data-stores/psql'
import { SEED_PREFIX, runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import * as services from '../run-services.mts'

const {
  getCommunitiesByIdBatch,
  getPostElectionsByIdBatch,
  getIndividualCards,
  getIndividualRewardsProgramPointValuations,
  getHouseholdSpendingCategoriesByUserId,
  getIndividualRewardsProgramStatuses,
  getUserPostsCollection,
  getPostsByAnyBatch,
  getPublicUsersByAnyBatch,
  getUserProfileMetricsByAny,
  listProfileLinks,
} = services

async function seededIds(table: string, tableTag: string, limit: number): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    `/* explainAnalyzeRun */ SELECT id FROM ${table} WHERE id::text LIKE $1 LIMIT ${limit}`,
    [`${SEED_PREFIX}-${tableTag}%`],
  )
  return rows.map(r => r.id)
}

// Loader queries the three hottest request shapes fan out to after their primary
// id query. The feed (GET /api/v1/feeds/posts/:feed_type), post detail
// (GET /api/v1/posts/:idOrSlug), and user profile (GET /api/v1/users/:idOrSlug)
// routes batch-load entities by id; these capture those batch loaders directly.
export async function runHotPathLoaderScenarios() {
  // Posts no longer share a fixed id prefix (seed-data/common.mts spreads their timestamps),
  // so they can't be located by a LIKE pattern like the other seeded tables below — compute the
  // same ids seedPosts() inserted directly instead.
  const postIds = Array.from({ length: 25 }, (_, index) => seedUuid(index, '05'))
  const userIds = await seededIds('users', '01', 25)
  const communityIds = await seededIds('communities', '14', 25)

  // Feed fan-out: getPostFeedIds (covered above) returns post ids, then the route
  // batch-loads posts, shared-by users, post elections, and post communities.
  await runAndCapture('feed-posts-batch', () => getPostsByAnyBatch(postIds))
  await runAndCapture('feed-shared-by-users-batch', () => getPublicUsersByAnyBatch(userIds))

  // Post elections + communities batches are shared between the feed and post-detail paths.
  await runAndCapture('post-elections-batch', () => getPostElectionsByIdBatch(postIds))
  await runAndCapture('post-communities-batch', () => getCommunitiesByIdBatch(communityIds))

  // Author/profile links: loaded by both the post-detail and user-profile routes.
  await runAndCapture('profile-links', () => listProfileLinks(seedUser.id))

  const firstCardPage = await getIndividualCards(seedUser, seedUser, { limit: 25 })
  registerScenarioContract('individual-cards-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_individual_cards__individual_id_id'],
        queryContains: 'FROM individual_cards',
        noSort: true,
      },
    ],
  })
  await runAndCapture('individual-cards-page', () =>
    getIndividualCards(seedUser, seedUser, {
      after: firstCardPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstPointValuationPage = await getIndividualRewardsProgramPointValuations(
    seedUser,
    seedUser,
    { limit: 25 },
  )
  registerScenarioContract('point-valuations-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_individua_rewards_program_point_valuation__individual_id_id'],
        queryContains: 'FROM individual_rewards_program_point_valuations',
        noSort: true,
      },
    ],
  })
  await runAndCapture('point-valuations-page', () =>
    getIndividualRewardsProgramPointValuations(seedUser, seedUser, {
      after: firstPointValuationPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstSpendingCategoryPage = await getHouseholdSpendingCategoriesByUserId(
    seedUser,
    seedUser,
    { limit: 25 },
  )
  registerScenarioContract('spending-categories-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_spending_entries__individual_id_id',
          'idx_spending_entries__household_id_id',
        ],
        queryContains: 'FROM spending_entries',
        noSort: true,
      },
    ],
  })
  await runAndCapture('spending-categories-page', () =>
    getHouseholdSpendingCategoriesByUserId(seedUser, seedUser, {
      after: firstSpendingCategoryPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstRewardsProgramStatusPage = await getIndividualRewardsProgramStatuses(
    seedUser,
    seedUser,
    { limit: 25 },
  )
  registerScenarioContract('rewards-program-statuses-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_individual_rewards_program_statuses__individual_id_id'],
        queryContains: 'FROM individual_rewards_program_statuses',
        noSort: true,
      },
    ],
  })
  await runAndCapture('rewards-program-statuses-page', () =>
    getIndividualRewardsProgramStatuses(seedUser, seedUser, {
      after: firstRewardsProgramStatusPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstSavedPostsPage = await getUserPostsCollection(seedUser, seedUser.id, 'saved', {
    limit: 25,
  })
  registerScenarioContract('profile-posts-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_relation__user__save__post__subject__newest'],
        queryContains: 'FROM relation__user__save__post',
        noSort: true,
      },
    ],
  })
  await runAndCapture('profile-posts-page', () =>
    getUserPostsCollection(seedUser, seedUser.id, 'saved', {
      after: firstSavedPostsPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  // User profile: per-profile metrics aggregation (view_user_metrics + member-community count).
  await runAndCapture('user-profile-metrics', () =>
    getUserProfileMetricsByAny(seedUser.id, { currentUser: seedUser }),
  )
}
