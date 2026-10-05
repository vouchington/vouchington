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
    INSERT INTO community_agent_prompt_revisions
      (community_id, community_agent_prompt_id, revised_by_id, revision_type, changes)
    VALUES
      (${communityId}, ${agentPromptId}, ${changedById}, ${action},
       fn_field_changes(${JSON.stringify(previousFields)}::jsonb, ${JSON.stringify(nextFields)}::jsonb))
  `)
}
