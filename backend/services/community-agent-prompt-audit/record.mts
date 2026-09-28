import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { promptAuditSide } from '@services/moderation-audit-facts'

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
  const previous = promptAuditSide(previousFields)
  const next = promptAuditSide(nextFields)
  await write(sql`/* recordCommunityAgentPromptChange */
    INSERT INTO community_agent_prompt_changes (
      community_id, agent_prompt_id, changed_by_id, action,
      previous_has_prompt, previous_prompt, next_has_prompt, next_prompt,
      previous_has_model_name, previous_model_name, next_has_model_name, next_model_name,
      previous_has_model_provider, previous_model_provider,
      next_has_model_provider, next_model_provider,
      previous_has_slot_allocated, previous_slot_allocated,
      next_has_slot_allocated, next_slot_allocated,
      previous_has_on_flag_action, previous_on_flag_action,
      next_has_on_flag_action, next_on_flag_action,
      previous_has_activated_at, previous_activated_at,
      next_has_activated_at, next_activated_at,
      previous_has_deactivated_at, previous_deactivated_at,
      next_has_deactivated_at, next_deactivated_at,
      previous_has_deleted_at, previous_deleted_at,
      next_has_deleted_at, next_deleted_at
    )
    VALUES (
      ${communityId}, ${agentPromptId}, ${changedById}, ${action},
      ${previous.has_prompt}, ${previous.prompt}, ${next.has_prompt}, ${next.prompt},
      ${previous.has_model_name}, ${previous.model_name}, ${next.has_model_name}, ${next.model_name},
      ${previous.has_model_provider}, ${previous.model_provider},
      ${next.has_model_provider}, ${next.model_provider},
      ${previous.has_slot_allocated}, ${previous.slot_allocated},
      ${next.has_slot_allocated}, ${next.slot_allocated},
      ${previous.has_on_flag_action}, ${previous.on_flag_action},
      ${next.has_on_flag_action}, ${next.on_flag_action},
      ${previous.has_activated_at}, ${previous.activated_at},
      ${next.has_activated_at}, ${next.activated_at},
      ${previous.has_deactivated_at}, ${previous.deactivated_at},
      ${next.has_deactivated_at}, ${next.deactivated_at},
      ${previous.has_deleted_at}, ${previous.deleted_at},
      ${next.has_deleted_at}, ${next.deleted_at}
    )
  `)
}
