import type { PrivateUser } from '@services/users/types'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createAgentPrompt, updateAgentPrompt } from '@services/agents'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'

export function createOpenAIPostLLMModerationPrompt(
  currentUser: PrivateUser,
  modelProvider: 'openai',
  modelName: 'gpt-5.4-nano',
  prompt: string,
  moderatorId: string,
) {
  assert(currentUser, 422, 'User is required')
  assert(prompt, 422, 'Prompt is required')
  assert(prompt.trim().length > 0, 422, 'Prompt cannot be empty')
  assert(moderatorId, 422, 'Moderator ID is required')

  return createAgentPrompt(moderatorId, prompt, modelName, modelProvider, currentUser.id)
}

type CreateOpenAIPostLLMModerationPromptUpdates = {
  active?: boolean
}

export function updateOpenAIPostLLMModerationPrompt(
  currentUser: PrivateUser,
  promptId: string,
  updates: CreateOpenAIPostLLMModerationPromptUpdates,
) {
  assert(currentUser, 422, 'User is required')
  assert(promptId, 422, 'Prompt ID is required')

  if (updates.active === undefined) {
    return null
  }

  return updateAgentPrompt(currentUser, promptId, { active: updates.active })
}

export async function getOpenAIPostLLMModerationPromptById(promptId: string) {
  const { rows } = await read(buildOpenAIPostLLMModerationPromptByIdQuery(promptId))
  return rows[0] || null
}

type GetOpenAIPostLLMModerationPromptsOptions = {
  limit?: number
  sort?: 'created' | 'activated'
  before_at?: Date
}

export const getOpenAIPostLLMModerationPrompts = async (
  currentUser: PrivateUser,
  options?: GetOpenAIPostLLMModerationPromptsOptions,
) => {
  assert(currentUser, 422, 'User is required')
  const query = buildOpenAIPostLLMModerationPromptsQuery(options)
  const { rows } = await read(query)
  return rows
}

export type ModeratorOnFlagAction = 'none' | 'review_queue'

export type ActiveModeratorConfig = {
  moderator_id: string
  moderator_slug: string
  on_flag_action: ModeratorOnFlagAction
  is_baseline: boolean
  system_user_id: string
  prompt: {
    id: string
    prompt: string
    model_name: string
    model_provider: string
  }
}

export async function getAllActiveModerationConfigs(): Promise<ActiveModeratorConfig[]> {
  const { rows } = await read(sql`/* getAllActiveModerationConfigs */
    SELECT DISTINCT ON (a.id)
      a.id as moderator_id,
      am.slug as moderator_slug,
      am.on_flag_action,
      am.is_baseline,
      a.system_user_id,
      json_build_object(
        'id', p.id,
        'prompt', p.prompt,
        'model_name', p.model_name,
        'model_provider', p.model_provider
      ) as prompt
    FROM agents a
    INNER JOIN agents__moderators am ON am.agent_id = a.id
    INNER JOIN agent_prompts p ON p.agent_id = a.id
    WHERE a.agent_type = 'moderator'
      AND a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
      AND p.activated_at IS NOT NULL
      AND p.deactivated_at IS NULL
      AND p.deleted_at IS NULL
    ORDER BY a.id, p.activated_at DESC, p.id DESC
  `)
  return rows
}

export function buildOpenAIPostLLMModerationPromptByIdQuery(promptId: string) {
  return sql`/* buildOpenAIPostLLMModerationPromptByIdQuery */
    SELECT
      ap.id,
      ap.model_name,
      ap.model_provider,
      ap.prompt,
      ap.agent_id as moderator_id
    FROM agent_prompts ap
    INNER JOIN agents a ON a.id = ap.agent_id
    WHERE ap.id = ${promptId}
      AND a.agent_type = 'moderator'
      AND a.deleted_at IS NULL
      AND ap.deleted_at IS NULL
  `
}

export function buildOpenAIPostLLMModerationPromptsQuery(
  options?: GetOpenAIPostLLMModerationPromptsOptions,
) {
  const { limit = 10, sort = 'activated', before_at } = options || {}

  const query = sql`/* buildOpenAIPostLLMModerationPromptsQuery */
    SELECT
      ap.id,
      ap.model_name,
      ap.model_provider,
      ap.prompt,
      ap.created_at,
      ap.activated_at,
      ap.deactivated_at
    FROM agent_prompts ap
    INNER JOIN agents a ON a.id = ap.agent_id
    WHERE a.agent_type = 'moderator'
      AND a.deleted_at IS NULL
      AND ap.deleted_at IS NULL
  `

  if (sort === 'activated') {
    query.append(sql` AND ap.activated_at IS NOT NULL`)
  }

  if (before_at) {
    if (sort === 'created') {
      const beforeBound = timestampToUuidv7LowerBound(before_at.getTime())
      query.append(sql` AND ap.id < ${beforeBound} AND ap.created_at < ${before_at}`)
    } else {
      query.append(sql`
        AND ap.activated_at < ${before_at}
      `)
    }
  }

  if (sort === 'created') {
    query.append(sql`
      ORDER BY ap.id DESC
    `)
  } else {
    query.append(sql`
      ORDER BY ap.activated_at DESC, ap.id DESC
    `)
  }

  query.append(sql` LIMIT ${limit}`)
  return query
}
