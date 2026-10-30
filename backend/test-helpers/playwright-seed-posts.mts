import type { TransactionQuery } from '@data-stores/psql'
import { seedPlaywrightPaginationReviews } from './playwright-seed-pagination-reviews.mts'
import { seedPlaywrightAgentAndComments } from './playwright-seed-agent-and-comments.mts'
import { seedPlaywrightPostAccountLabels } from './playwright-seed-account-labels.mts'
import { seedPlaywrightAuthoredRelations } from './playwright-seed-authored-relations.mts'
import { seedPlaywrightReferralsAndLandingPages } from './playwright-seed-referrals.mts'
import { seedPlaywrightRewardsProfile } from './playwright-seed-rewards-profile.mts'
import { seedPlaywrightPostFeedFixtures } from './playwright-seed-feed-fixtures.mts'

export async function seedPlaywrightPostData(query: TransactionQuery): Promise<void> {
  await seedPlaywrightPaginationReviews(query)
  await seedPlaywrightAgentAndComments(query)
  await seedPlaywrightPostAccountLabels(query)
  await seedPlaywrightAuthoredRelations(query)
  await seedPlaywrightReferralsAndLandingPages(query)
  await seedPlaywrightRewardsProfile(query)
  await seedPlaywrightPostFeedFixtures(query)
}
