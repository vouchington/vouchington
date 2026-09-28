import { read, write } from '@data-stores/psql'
import { PROMPT_AUDIT_SELECT, promptFieldsFromRow } from '@services/moderation-audit-facts'
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
  const query = sql`/* getCommunityAgentPromptChangeRowsForTest */
    SELECT agent_prompt_id, community_id, changed_by_id, action, `
  query.append(PROMPT_AUDIT_SELECT)
  query.append(sql`
    FROM community_agent_prompt_changes
    WHERE agent_prompt_id = ${agentPromptId}
    ORDER BY id DESC
  `)
  const { rows } = await read<Record<string, unknown>>(query)
  return rows.map(row => ({
    agent_prompt_id: String(row.agent_prompt_id),
    community_id: String(row.community_id),
    changed_by_id: row.changed_by_id == null ? null : String(row.changed_by_id),
    action: String(row.action),
    previous_fields: promptFieldsFromRow(row, 'previous'),
    next_fields: promptFieldsFromRow(row, 'next'),
  }))
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
