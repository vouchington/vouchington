import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityAgentPrompt } from './types.mts'

export async function getCommunityAgentPrompt(
  promptId: string,
): Promise<CommunityAgentPrompt | null> {
  const { rows } = await read(
    sql`/* getCommunityAgentPrompt */
    SELECT
      cap.id,
      cap.community_id,
      cap.created_by_id,
      cap.slot_allocated,
      cap.on_flag_action,
      cap.activated_at,
      cap.deactivated_at,
      cap.deleted_at,
      cap.deleted_by_id,
      ap.agent_id,
      ap.prompt,
      ap.model_name,
      ap.model_provider,
      ap.created_at,
      ap.updated_at
    FROM community_agent_prompts cap
    JOIN agent_prompts ap ON ap.id = cap.id
    WHERE cap.id = ${promptId}
      AND cap.deleted_at IS NULL
      AND ap.deleted_at IS NULL
    LIMIT 1
    `,
  )
  return (rows[0] as CommunityAgentPrompt) ?? null
}

export async function searchCommunityAgentPrompts(
  communityId: string,
): Promise<CommunityAgentPrompt[]> {
  const { rows } = await read(
    sql`/* searchCommunityAgentPrompts */
    SELECT
      cap.id,
      cap.community_id,
      cap.created_by_id,
      cap.slot_allocated,
      cap.on_flag_action,
      cap.activated_at,
      cap.deactivated_at,
      cap.deleted_at,
      cap.deleted_by_id,
      ap.agent_id,
      ap.prompt,
      ap.model_name,
      ap.model_provider,
      ap.created_at,
      ap.updated_at
    FROM community_agent_prompts cap
    JOIN agent_prompts ap ON ap.id = cap.id
    WHERE cap.community_id = ${communityId}
      AND cap.deleted_at IS NULL
      AND ap.deleted_at IS NULL
    ORDER BY cap.id DESC
    `,
  )
  return rows as CommunityAgentPrompt[]
}
