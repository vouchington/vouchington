import { read } from '@data-stores/psql'
import { SEED_PREFIX, runAndCapture, seedUser } from '../run-support.mts'
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

  const firstCardPage = await getIndividualCards(seedUser as any, seedUser as any, { limit: 25 })
  await runAndCapture('individual-cards-page', () =>
    getIndividualCards(seedUser as any, seedUser as any, {
      after: firstCardPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstPointValuationPage = await getIndividualRewardsProgramPointValuations(
    seedUser as any,
    seedUser as any,
    { limit: 25 },
  )
  await runAndCapture('point-valuations-page', () =>
    getIndividualRewardsProgramPointValuations(seedUser as any, seedUser as any, {
      after: firstPointValuationPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstSpendingCategoryPage = await getHouseholdSpendingCategoriesByUserId(
    seedUser as any,
    seedUser as any,
    { limit: 25 },
  )
  await runAndCapture('spending-categories-page', () =>
    getHouseholdSpendingCategoriesByUserId(seedUser as any, seedUser as any, {
      after: firstSpendingCategoryPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstRewardsProgramStatusPage = await getIndividualRewardsProgramStatuses(
    seedUser as any,
    seedUser as any,
    { limit: 25 },
  )
  await runAndCapture('rewards-program-statuses-page', () =>
    getIndividualRewardsProgramStatuses(seedUser as any, seedUser as any, {
      after: firstRewardsProgramStatusPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  const firstSavedPostsPage = await getUserPostsCollection(seedUser as any, seedUser.id, 'saved', {
    limit: 25,
  })
  await runAndCapture('profile-posts-page', () =>
    getUserPostsCollection(seedUser as any, seedUser.id, 'saved', {
      after: firstSavedPostsPage.page_info.end_cursor!,
      limit: 25,
    }),
  )

  // User profile: per-profile metrics aggregation (view_user_metrics + member-community count).
  await runAndCapture('user-profile-metrics', () =>
    getUserProfileMetricsByAny(seedUser.id, { currentUser: seedUser as any }),
  )
}
