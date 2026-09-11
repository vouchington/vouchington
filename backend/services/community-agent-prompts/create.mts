import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { v7 as uuidv7 } from 'uuid'
import type { CommunityAgentPrompt } from './types.mts'
import { createAgentSystemUser } from '@services/users/create-system-user'
import { createSystemAgent } from '@services/agents/create'
import { getCommunity } from '@services/communities'
import {
  recordCommunityAgentPromptChange,
  snapshotCommunityAgentPrompt,
} from '@services/community-agent-prompt-audit'

const VALID_MODEL_NAMES = new Set(['gpt-5.4-nano'])
const VALID_MODEL_PROVIDERS = new Set(['openai'])

export async function createCommunityAgentPrompt(
  currentUserId: string,
  communityId: string,
  options: {
    prompt: string
    modelName?: string
    modelProvider?: string
  },
): Promise<CommunityAgentPrompt> {
  const { modelName = 'gpt-5.4-nano', modelProvider = 'openai' } = options
  assert(VALID_MODEL_NAMES.has(modelName), 422, `Invalid model_name: ${modelName}`)
  assert(VALID_MODEL_PROVIDERS.has(modelProvider), 422, `Invalid model_provider: ${modelProvider}`)
  const prompt = options.prompt.trim()
  assert(
    prompt.length >= 1 && prompt.length <= 10000,
    422,
    'prompt must be between 1 and 10000 characters',
  )

  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')

  const promptId = uuidv7()
  const username = `${community.slug}-agent-${promptId.replace(/-/g, '').slice(-12)}`

  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const { id: userId } = await createAgentSystemUser(username, { query })
  const { id: agentId } = await createSystemAgent(userId, 'moderator', currentUserId, { query })

  const { rows: apRows } = await query(sql`/* createCommunityAgentPrompt */
    INSERT INTO agent_prompts (id, agent_id, prompt, model_name, model_provider, created_by_id)
    VALUES (
      ${promptId},
      ${agentId},
      ${prompt},
      ${modelName}::agent_models,
      ${modelProvider}::agent_model_providers,
      ${currentUserId}
    )
    RETURNING id, agent_id, prompt, model_name, model_provider, created_at, updated_at
  `)

  const { rows: capRows } = await query(sql`/* createCommunityAgentPrompt */
    INSERT INTO community_agent_prompts (id, community_id, created_by_id)
    VALUES (${promptId}, ${communityId}, ${currentUserId})
    RETURNING id, community_id, created_by_id, slot_allocated, on_flag_action, activated_at, deactivated_at, deleted_at, deleted_by_id
  `)

  const ap = apRows[0]
  const cap = capRows[0]
  assert(ap && cap, 500, 'Failed to create agent prompt')

  const result = {
    id: cap.id,
    community_id: cap.community_id,
    created_by_id: cap.created_by_id,
    slot_allocated: cap.slot_allocated,
    on_flag_action: cap.on_flag_action,
    activated_at: cap.activated_at,
    deactivated_at: cap.deactivated_at,
    deleted_at: cap.deleted_at,
    deleted_by_id: cap.deleted_by_id,
    agent_id: ap.agent_id,
    prompt: ap.prompt,
    model_name: ap.model_name,
    model_provider: ap.model_provider,
    created_at: ap.created_at,
    updated_at: ap.updated_at,
  } as CommunityAgentPrompt

  await query.commit()

  // Use the transaction result directly — avoids a read-replica read that could race with the write.
  await recordCommunityAgentPromptChange(
    currentUserId,
    communityId,
    result.id,
    'created',
    {},
    snapshotCommunityAgentPrompt(result),
  )

  return result
}
