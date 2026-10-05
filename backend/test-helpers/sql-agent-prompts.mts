import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getCommunityAgentPromptChangeRowsForTest(agentPromptId: string): Promise<
  Array<{
    community_agent_prompt_id: string
    community_id: string
    revised_by_id: string | null
    revision_type: string
    changes: Record<string, { before: unknown; after: unknown }>
  }>
> {
  const { rows } = await read<{
    community_agent_prompt_id: string
    community_id: string
    revised_by_id: string | null
    revision_type: string
    changes: Record<string, { before: unknown; after: unknown }>
  }>(sql`/* getCommunityAgentPromptChangeRowsForTest */
    SELECT community_agent_prompt_id, community_id, revised_by_id, revision_type, changes
    FROM community_agent_prompt_revisions
    WHERE community_agent_prompt_id = ${agentPromptId}
    ORDER BY id DESC
  `)
  return rows
}

export async function updateAgentPromptIdForTest(
  promptId: string,
  nextPromptId: string,
): Promise<{ id: string; created_at: Date }> {
  const { rows } = await write<{
    id: string
    created_at: Date
  }>(sql`/* updateAgentPromptIdForTest */
    UPDATE agent_prompts
    SET id = ${nextPromptId}
    WHERE id = ${promptId}
    RETURNING id, created_at
  `)
  return rows[0]!
}
