import { SEED_PREFIX, heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getAllReferralLinksPage, getPrioritizedReferralLinks } from '../run-services.mts'

export async function runPrioritizedReferralLinkScenarios(): Promise<void> {
  const seedReferralProgramId = `${SEED_PREFIX}-0900-7000-8000-000000000000`
  registerScenarioContract('prioritized-referral-links', {
    expectations: [],
    crossPartition: {
      session_referral_attributions:
        'The indexed viewer user_id lookup searches all policy-retained monthly click partitions; an age bound would truncate retained referral history.',
    },
  })
  await runAndCapture('prioritized-referral-links', async () => {
    // seeduser1 follows the seeded link owner and the large program's authors, so the follow group
    // is not empty (seeduser0 follows no link author).
    await getPrioritizedReferralLinks(heavyFollowUser.id, seedReferralProgramId)
  })
  await runAndCapture('prioritized-referral-links-all-page', () =>
    getAllReferralLinksPage(seedUser.id, seedReferralProgramId, { limit: 25 }),
  )
}
