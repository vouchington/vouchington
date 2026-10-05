import type { ModerationTrainingEvidence } from './types.mts'
import assert from 'http-assert'
import { read, type QueryOptions } from '@data-stores/psql'
import { recordModerationTrainingFeedback } from './feedback.mts'

export async function recordAgentModerationVoteTrainingFeedback(
  input: {
    trainingEvidence: ModerationTrainingEvidence
    actorUserId: string
    agentModerationId: string
    score: number | null
  },
  options?: QueryOptions,
): Promise<void> {
  const context = await getAgentModerationTrainingContext(input.agentModerationId, options)
  assert(context, 404, 'Agent moderation not found')
  const score = input.score ?? 0
  await recordModerationTrainingFeedback(
    {
      trainingEvidence: input.trainingEvidence,
      sourceType: 'agent_moderation_vote',
      eventType: 'agent_accuracy_voted',
      label: getAgentModerationVoteLabel(score, context.is_flagged),
      humanAction:
        score === 1 ? 'accuracy_upvote' : score === -1 ? 'accuracy_downvote' : 'accuracy_unvote',
      actorUserId: input.actorUserId,
      communityId: context.community_id,
      postId: context.post_id,
      agentModerationId: input.agentModerationId,
      metadata: { score: input.score },
    },
    options,
  )
}

async function getAgentModerationTrainingContext(
  agentModerationId: string,
  options?: QueryOptions,
): Promise<{ post_id: string; community_id: string | null; is_flagged: boolean } | null> {
  const { rows } = await read<{
    post_id: string
    community_id: string | null
    is_flagged: boolean
  }>(
    `/* getAgentModerationTrainingContext */
    SELECT am.post_id, COALESCE(p.community_id, cap.community_id) AS community_id, am.is_flagged
    FROM agent_moderations am
    JOIN posts p ON p.id = am.post_id
    LEFT JOIN community_agent_prompts cap ON cap.id = am.prompt_id
    WHERE am.id = $1
    LIMIT 1`,
    [agentModerationId],
    options,
  )
  return rows[0] ?? null
}

function getAgentModerationVoteLabel(score: number, is_flagged: boolean) {
  if (score === 0) return 'not_applicable'
  if (is_flagged) return score === 1 ? 'true_positive' : 'false_positive'
  return score === 1 ? 'true_negative' : 'false_negative_candidate'
}
