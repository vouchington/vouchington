import { seedUploadCleanup } from './upload-cleanup.mts'
import { seedLandingPageCandidates } from './landing-page-candidates.mts'

/** Finish the standalone workload cohorts before the seed runner analyzes every relation. */
export async function seedFinalExplainFixtures(): Promise<void> {
  await seedUploadCleanup()
  await seedLandingPageCandidates()
}
