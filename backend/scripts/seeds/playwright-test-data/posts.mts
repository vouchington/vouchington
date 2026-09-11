import type { TransactionQuery } from '@data-stores/psql'
import { seedPlaywrightPaginationReviews } from './post-pagination-reviews.mts'
import { seedPlaywrightAgentAndComments } from './post-agent-and-comments.mts'
import { seedPlaywrightAuthoredRelations } from './post-authored-relations.mts'
import { seedPlaywrightReferralsAndLandingPages } from './post-referrals-and-landing-pages.mts'
import { seedPlaywrightRewardsProfile } from './post-rewards-profile.mts'
import { seedPlaywrightPostFeedFixtures } from './post-feed-fixtures.mts'

export async function seedPlaywrightPostData(query: TransactionQuery): Promise<void> {
  await seedPlaywrightPaginationReviews(query)
  await seedPlaywrightAgentAndComments(query)
  await seedPlaywrightAuthoredRelations(query)
  await seedPlaywrightReferralsAndLandingPages(query)
  await seedPlaywrightRewardsProfile(query)
  await seedPlaywrightPostFeedFixtures(query)
}
