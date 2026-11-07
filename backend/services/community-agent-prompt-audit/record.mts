import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CommunityAgentPromptChangeAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'allocated'
  | 'deallocated'
  | 'deactivated'

export type CommunityAgentPromptChange = {
  agentPromptId: string
  action: CommunityAgentPromptChangeAction
  previousFields: Record<string, unknown>
  nextFields: Record<string, unknown>
}

/** Writes one revision row per change in a single INSERT. */
export async function recordCommunityAgentPromptChanges(
  changedById: string,
  communityId: string,
  changes: readonly CommunityAgentPromptChange[],
): Promise<void> {
  if (changes.length === 0) return
  await write(sql`/* recordCommunityAgentPromptChanges */
    INSERT INTO community_agent_prompt_revisions
      (community_id, community_agent_prompt_id, revised_by_id, revision_type, changes)
    SELECT ${communityId}::uuid, change.agent_prompt_id, ${changedById}::uuid, change.action::community_agent_prompt_revision_types,
      fn_field_changes(change.previous_fields, change.next_fields)
    FROM jsonb_to_recordset(${JSON.stringify(
      changes.map(change => ({
        agent_prompt_id: change.agentPromptId,
        action: change.action,
        previous_fields: change.previousFields,
        next_fields: change.nextFields,
      })),
    )}::jsonb) AS change(agent_prompt_id uuid, action text, previous_fields jsonb, next_fields jsonb)
  `)
}

export function recordCommunityAgentPromptChange(
  changedById: string,
  communityId: string,
  agentPromptId: string,
  action: CommunityAgentPromptChangeAction,
  previousFields: Record<string, unknown>,
  nextFields: Record<string, unknown>,
): Promise<void> {
  return recordCommunityAgentPromptChanges(changedById, communityId, [
    { agentPromptId, action, previousFields, nextFields },
  ])
}
