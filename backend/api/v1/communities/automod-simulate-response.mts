import type { CommunityPromptSimulationResult } from '@agents/community-moderation'
import type { CommunityAgentPromptSimulationPost } from '@services/community-agent-prompts/simulations'

export function createAutomodSimulationResults(
  posts: CommunityAgentPromptSimulationPost[],
  simulationResults: CommunityPromptSimulationResult[],
) {
  const resultByPostId = new Map(simulationResults.map(result => [result.post_id, result]))
  return posts.map(post => {
    const result = resultByPostId.get(post.id)!
    return {
      post_id: post.id,
      title: post.title,
      declared_language: post.declared_language,
      lingua_rs_detected_language: post.lingua_rs_detected_language,
      post_type: post.post_type,
      approved_at: post.approved_at.toISOString(),
      content_excerpt: post.content_excerpt,
      flagged: result.flagged,
      reason: result.reason,
    }
  })
}
