import { SEED_PREFIX, heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import { getAllReferralLinksPage, getPrioritizedReferralLinks } from '../run-services.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { RECENT_VOTE_LIMIT } from '@services/prioritized-referral-links/config'
import { VOTE_HISTORY_USER_ID } from '../seed-data/recommended-topics-vote-history.mts'

export async function runPrioritizedReferralLinkScenarios(): Promise<void> {
  const seedReferralProgramId = `${SEED_PREFIX}-0900-7000-8000-000000000000`
  await runAndCapture('prioritized-referral-links', async () => {
    // seeduser1 follows the seeded link owner and the large program's authors, so the follow group
    // is not empty (seeduser0 follows no link author).
    await getPrioritizedReferralLinks(heavyFollowUser.id, seedReferralProgramId)
  })
  await runAndCapture('prioritized-referral-links-all-page', () =>
    getAllReferralLinksPage(seedUser.id, seedReferralProgramId, { limit: 25 }),
  )
  // A viewer with several times the recent-vote window: the vote read must stop at the window by
  // walking the newest-first current-ballot index instead of reading and sorting every ballot.
  registerScenarioContract('prioritized-referral-links-long-vote-history', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_post_vote_states__user_id_id_post_id_score'],
        queryContains: 'getInNetworkReferralLinks',
      },
      { kind: 'maxProcessedRows', relation: 'post_vote_states', max: RECENT_VOTE_LIMIT },
    ],
  })
  await runAndCapture('prioritized-referral-links-long-vote-history', () =>
    getPrioritizedReferralLinks(VOTE_HISTORY_USER_ID, seedReferralProgramId),
  )
}
