import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items/get-batch'
import { getSystemUserByUsername } from '@services/users/system-users'
import type { StoryClusterCandidateRow as CandidateRow } from '@voucha/types/entities/story'
import { STORY_CLUSTER_CANDIDATE_LIMIT } from '@voucha/config'
import { buildClusteringAgentContent } from './content.mts'
import {
  callOpenAIClusteringAgent,
  type ClusteringAgentResult,
} from './openai-clustering-agent.mts'
import onError from '@modules/on-error'

export type { ClusteringAgentResult }

interface RunStoryClusteringAgentDeps {
  callOpenAIClusteringAgent?: typeof callOpenAIClusteringAgent
}

export async function runStoryClusteringAgent(
  itemId: string,
  candidates: CandidateRow[],
  deps: RunStoryClusteringAgentDeps = {},
): Promise<ClusteringAgentResult | null> {
  const callClusteringAgent = deps.callOpenAIClusteringAgent ?? callOpenAIClusteringAgent

  try {
    const storyTeller = await getSystemUserByUsername('story-teller')
    if (!storyTeller) {
      throw new Error('story-teller system user not found')
    }

    const limitedCandidates = candidates.slice(0, STORY_CLUSTER_CANDIDATE_LIMIT)
    const allIds = [itemId, ...limitedCandidates.map(c => c.id)]
    const items = await getRssFeedItemsByIdBatch(allIds)
    const [newItem, ...candidateItems] = items

    if (!newItem) return null

    const candidatesWithItems = limitedCandidates.flatMap((candidate, i) => {
      const item = candidateItems[i]
      return item != null ? [{ candidate, item }] : []
    })

    if (candidatesWithItems.length === 0) return null

    const { content } = await buildClusteringAgentContent(newItem, candidatesWithItems)

    return await callClusteringAgent(content, itemId)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}
