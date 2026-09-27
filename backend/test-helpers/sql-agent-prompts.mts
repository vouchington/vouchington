import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getCommunityAgentPromptChangeRowsForTest(agentPromptId: string): Promise<
  Array<{
    agent_prompt_id: string
    community_id: string
    changed_by_id: string | null
    action: string
    previous_fields: Record<string, unknown>
    next_fields: Record<string, unknown>
  }>
> {
  const { rows } = await read<{
    agent_prompt_id: string
    community_id: string
    changed_by_id: string | null
    action: string
    previous_fields: Record<string, unknown>
    next_fields: Record<string, unknown>
  }>(sql`/* getCommunityAgentPromptChangeRowsForTest */
    SELECT agent_prompt_id, community_id, changed_by_id, action, previous_fields, next_fields
    FROM community_agent_prompt_changes
    WHERE agent_prompt_id = ${agentPromptId}
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
