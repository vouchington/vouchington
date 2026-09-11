import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getAgentModerationElectionByIdCachedBatch } from '@services/entity-fetch'
import {
  getAgentModerationElectionVotesByUser,
  type ViewAgentModerationElection,
} from '@services/elections-votes/agent-moderation'
import type { ElectionVote } from '@services/elections-votes/shared'
import type { AgentModerationResult } from '@services/moderation'

export function indexPostModerationsByPostId(
  moderations: AgentModerationResult[],
): Record<string, AgentModerationResult[]> {
  // `Object.groupBy`'s lib types return `Partial<Record<...>>` since a key that never occurs
  // has no entry, but every key actually produced here is guaranteed a non-empty array — the
  // cast narrows back to this function's existing non-partial return contract, not masking a
  // real possible-`undefined` case.
  return Object.groupBy(moderations, moderation => moderation.post_id) as Record<
    string,
    AgentModerationResult[]
  >
}

export async function getAgentModerationElectionsRecord(
  moderations: AgentModerationResult[],
): Promise<Record<string, ViewAgentModerationElection>> {
  const electionIds = [...new Set(moderations.map(moderation => moderation.id))]
  if (electionIds.length === 0) {
    return {}
  }

  const elections = await getAgentModerationElectionByIdCachedBatch(electionIds)
  return indexById(elections)
}

export async function mergeElectionVotesWithAgentModerations(
  userId: string,
  moderations: AgentModerationResult[],
  baseVotes?: Record<string, ElectionVote>,
): Promise<Record<string, ElectionVote> | undefined> {
  const electionIds = [...new Set(moderations.map(moderation => moderation.id))]
  if (electionIds.length === 0) {
    return baseVotes
  }

  const moderationVotes = await getAgentModerationElectionVotesByUser(userId, electionIds)
  const mergedVotes = {
    ...(baseVotes ?? {}),
    ...electionVotesMapToRecord(
      new Map<string, ElectionVote>(
        moderationVotes.map(vote => [vote.entity_id, vote satisfies ElectionVote]),
      ),
    ),
  }

  return Object.keys(mergedVotes).length > 0 ? mergedVotes : undefined
}
