import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModerationStoredResults } from '@services/moderation/results'

export type CommunityAgentModerationResult = {
  id: string
  post_id: string
  community_prompt_id: string
  flagged: boolean
  results: AgentModerationStoredResults
  created_at: Date
}

export async function searchCommunityAgentModerations(
  postId: string,
  communityId: string,
): Promise<CommunityAgentModerationResult[]> {
  const { rows } = await read(sql`/* searchCommunityAgentModerations */
    SELECT
      am.id,
      am.post_id,
      am.prompt_id AS community_prompt_id,
      am.flagged,
      am.results,
      am.created_at
    FROM agent_moderations am
    JOIN community_agent_prompts cap ON cap.id = am.prompt_id
    WHERE am.post_id = ${postId}
      AND cap.community_id = ${communityId}
      AND cap.deleted_at IS NULL
      AND am.deleted_at IS NULL
    ORDER BY am.id ASC
  `)
  return rows as CommunityAgentModerationResult[]
}
