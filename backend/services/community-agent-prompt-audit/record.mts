import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CommunityAgentPromptChangeAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'allocated'
  | 'deallocated'
  | 'deactivated'

export async function recordCommunityAgentPromptChange(
  changedById: string,
  communityId: string,
  agentPromptId: string,
  action: CommunityAgentPromptChangeAction,
  previousFields: Record<string, unknown>,
  nextFields: Record<string, unknown>,
): Promise<void> {
  await write(sql`/* recordCommunityAgentPromptChange */
    INSERT INTO community_agent_prompt_changes
      (community_id, agent_prompt_id, changed_by_id, action, previous_fields, next_fields)
    VALUES
      (${communityId}, ${agentPromptId}, ${changedById}, ${action},
       ${JSON.stringify(previousFields)}, ${JSON.stringify(nextFields)})
  `)
}
