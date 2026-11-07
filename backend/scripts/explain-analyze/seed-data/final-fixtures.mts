import { seedIneligibleCollectionPages } from './ineligible-collection-pages.mts'
import { seedLandingPageCandidates } from './landing-page-candidates.mts'
import { seedSessionLimits } from './session-limits.mts'
import { seedUploadCleanup } from './upload-cleanup.mts'
import { seedRssFeedWeeklyWorkload } from './rss-feed-weekly-workload.mts'
import { seedRssFeedWeeklyProxy } from './rss-feed-weekly-proxy.mts'

/** Finish the standalone workload cohorts before the seed runner analyzes every relation. */
export async function seedFinalExplainFixtures(): Promise<void> {
  await seedUploadCleanup()
  await seedLandingPageCandidates()
  await seedSessionLimits()
  await seedIneligibleCollectionPages()
  await seedRssFeedWeeklyWorkload()
  await seedRssFeedWeeklyProxy()
}
