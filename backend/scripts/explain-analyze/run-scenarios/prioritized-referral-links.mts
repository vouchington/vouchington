import { SEED_PREFIX, runAndCapture, seedUser } from '../run-support.mts'
import * as services from '../run-services.mts'

const { getAllReferralLinksPage, getPrioritizedReferralLinks, loadOutOfNetworkLinks } = services

export async function runPrioritizedReferralLinkScenarios(): Promise<void> {
  const seedReferralProgramId = `${SEED_PREFIX}-0900-7000-8000-000000000000`
  await runAndCapture('prioritized-referral-links', async () => {
    await getPrioritizedReferralLinks(seedUser.id, seedReferralProgramId)
  })
  await runAndCapture('prioritized-referral-links-all-page', () =>
    getAllReferralLinksPage(seedUser.id, seedReferralProgramId, { limit: 25 }),
  )
  // The cached read hides this ranking on a warm cache, so explain the uncached loader itself. It
  // ranks every active link in the program; the seed gives the program thousands of authors with
  // posts tied to it (seed-data/referral-links-large-program.mts), so the plan shows that cost.
  await runAndCapture('prioritized-referral-links-cache-miss', () =>
    loadOutOfNetworkLinks(seedReferralProgramId),
  )
}
