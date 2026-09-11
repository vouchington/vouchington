import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentPrompt, AgentModel, AgentModelProvider } from './types.mts'

export async function getActiveAgentPromptByAgentId(agent_id: string): Promise<AgentPrompt | null> {
  const { rows } = await read(sql`/* getActiveAgentPromptByAgentId */
    SELECT
      id,
      prompt,
      agent_id,
      model_name,
      model_provider,
      created_at,
      updated_at,
      activated_at,
      deactivated_at,
      deleted_at
    FROM agent_prompts
    WHERE agent_id = ${agent_id}
      AND activated_at IS NOT NULL
      AND deactivated_at IS NULL
      AND deleted_at IS NULL
    ORDER BY activated_at DESC
    LIMIT 1
  `)

  if (rows.length === 0) return null

  return rows[0]
}

export async function createAgentPrompt(
  agent_id: string,
  prompt: string,
  model_name: AgentModel,
  model_provider: AgentModelProvider,
  created_by_id: string | null = null,
): Promise<AgentPrompt> {
  const { rows } = await write(sql`/* createAgentPrompt */
    INSERT INTO agent_prompts (
      agent_id,
      prompt,
      model_name,
      model_provider,
      created_by_id
    ) VALUES (${agent_id}, ${prompt}, ${model_name}, ${model_provider}, ${created_by_id})
    RETURNING
      id,
      prompt,
      agent_id,
      model_name,
      model_provider,
      created_at,
      updated_at,
      activated_at,
      deactivated_at,
      deleted_at
  `)

  return rows[0]
}

type UpdateAgentPromptOptions = {
  active?: boolean
}

export async function updateAgentPrompt(
  currentUser: { id: string },
  prompt_id: string,
  updates: UpdateAgentPromptOptions,
): Promise<AgentPrompt | null> {
  if (updates.active === undefined) {
    return null
  }

  const { rows } = await write(sql`/* updateAgentPrompt */
    UPDATE agent_prompts
    SET activated_at = CASE WHEN ${updates.active} THEN CURRENT_TIMESTAMP ELSE NULL END,
        deactivated_at = CASE WHEN ${updates.active} THEN NULL ELSE CURRENT_TIMESTAMP END,
        updated_at = CURRENT_TIMESTAMP,
        updated_by_id = ${currentUser.id}
    WHERE id = ${prompt_id}
      AND deleted_at IS NULL
    RETURNING
      id,
      prompt,
      agent_id,
      model_name,
      model_provider,
      created_at,
      updated_at,
      activated_at,
      deactivated_at,
      deleted_at
  `)

  if (rows.length === 0) return null

  return rows[0]
}
