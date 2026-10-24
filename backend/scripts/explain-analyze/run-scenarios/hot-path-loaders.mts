import { read } from '@data-stores/psql'
import { SEED_PREFIX, runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getViewPostsHydrationContract } from '../view-posts-hydration-contract.mts'
import { seedUuid } from '../seed-data/common.mts'
import * as services from '../run-services.mts'
import { POSTS_CREATOR_INDEXES } from './posts-creator-indexes.mts'

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
  getBookmarksForEntityGroups,
  listProfileLinks,
} = services

async function seededIds(table: string, tableTag: string, limit: number): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    `/* explainAnalyzeRun */ SELECT id FROM ${table} WHERE id::text LIKE $1 LIMIT ${limit}`,
    [`${SEED_PREFIX}-${tableTag}%`],
  )
  return rows.map(r => r.id)
}

// Feed, detail, and profile routes fan out to these id batches after their primary query.
export async function runHotPathLoaderScenarios() {
  // Seeded posts lack a stable LIKE prefix, so derive ids directly from seedPosts().
  const postIds = Array.from({ length: 25 }, (_, index) => seedUuid(index, '05'))
  const creatorIds = Array.from({ length: 25 }, (_, index) => seedUuid(index, '01'))
  const userIds = await seededIds('users', '01', 25)
  const communityIds = await seededIds('communities', '14', 25)

  // Feed fan-out: getPostFeedIds (covered above) returns post ids, then the route
  // batch-loads posts, shared-by users, post elections, and post communities.
  const feedPostIds = Array.from({ length: 50 }, (_, index) => seedUuid(index, '05'))
  registerScenarioContract(
    'feed-posts-batch',
    await getViewPostsHydrationContract('feed-posts-batch'),
  )
  await runAndCapture('feed-posts-batch', () => getPostsByAnyBatch(feedPostIds))
  await runAndCapture('feed-shared-by-users-batch', () => getPublicUsersByAnyBatch(userIds))

  // Post elections + communities batches are shared between the feed and post-detail paths.
  await runAndCapture('post-elections-batch', () => getPostElectionsByIdBatch(postIds))
  await runAndCapture('post-communities-batch', () => getCommunitiesByIdBatch(communityIds))

  // Author/profile links: loaded by both the post-detail and user-profile routes.
  await runAndCapture('profile-links', () => listProfileLinks(seedUser.id))

  registerScenarioContract('post-and-creator-bookmarks', {
    // Both plan-cache modes read 25 saved-post rows and one creator-follow row; budgets add 20%.
    expectations: [
      { kind: 'maxProcessedRows', relation: 'relation__user__save__post', max: 30 },
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__post', max: 2 },
      { kind: 'maxProcessedRows', relation: 'relation__user__follow__user', max: 2 },
    ],
  })
  await runAndCapture(
    'post-and-creator-bookmarks',
    () =>
      getBookmarksForEntityGroups(seedUser, [
        { entityTypeName: 'post', entities: postIds },
        { entityTypeName: 'user', entities: creatorIds },
      ]),
    undefined,
    'queryEntityBookmarksForRelations',
  )

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
  registerScenarioContract('user-profile-metrics', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: POSTS_CREATOR_INDEXES,
        anyOf: true,
        queryContains: 'GROUP BY metric_scope, post_type',
      },
      // Both modes process 6,076 post rows across public and viewer visibility scopes; +20%.
      { kind: 'maxProcessedRows', relation: 'posts', max: 7_292 },
    ],
  })
  await runAndCapture('user-profile-metrics', () =>
    getUserProfileMetricsByAny(seedUser.id, { currentUser: seedUser }),
  )
}
