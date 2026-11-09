import type { PrivateUser } from '@services/users/types'
import { getRecommendedTopicsWorkLimit } from '@services/recommended-topics/work-limits'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getRecommendedTopics } from '../run-services.mts'
import { VOTE_HISTORY_USER_ID } from '../seed-data/recommended-topics-vote-history.mts'

const voteHistoryUser = {
  __entity_type: 'user' as const,
  id: VOTE_HISTORY_USER_ID,
  username: 'seeduser19500',
  roles: [] as readonly string[],
} as PrivateUser

/**
 * A viewer with several times the configured vote window, and newer votes from other users in the
 * table: the read must stop at the window instead of walking the whole history.
 */
export async function runRecommendedTopicsVoteHistoryScenario(): Promise<void> {
  registerScenarioContract('recommended-topics-long-vote-history', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['post_votes__default_user_id_id_post_id_score_idx'] },
      {
        kind: 'maxProcessedRows',
        relation: 'post_votes',
        max: getRecommendedTopicsWorkLimit('vote_history_window'),
      },
    ],
  })
  await runAndCapture('recommended-topics-long-vote-history', () =>
    getRecommendedTopics(voteHistoryUser, { limit: 25 }),
  )
}
