import {
  recordAgentModerationVoteTrainingFeedback,
  type ModerationTrainingEvidence,
} from '@services/moderation-training'
import { upsertAgentModerationElectionVotes } from './votes-upsert.mts'
import type { ElectionVoteScore } from '../shared/types.mts'

export function upsertAgentModerationVotesWithTrainingEvidence(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  trainingEvidence: ModerationTrainingEvidence,
) {
  return upsertAgentModerationElectionVotes(userId, votes, (vote, query) =>
    recordAgentModerationVoteTrainingFeedback(
      {
        actorUserId: userId,
        agentModerationId: vote.entity_id,
        score: vote.score,
        trainingEvidence,
      },
      { query },
    ),
  )
}
