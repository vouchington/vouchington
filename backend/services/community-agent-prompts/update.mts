import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunityAgentPrompt } from './get.mts'
import { getCommunity } from '@services/communities'
import type { CommunityAgentPrompt } from './types.mts'
import type { PrivateUser } from '@services/users/types'
import {
  recordCommunityAgentPromptChange,
  snapshotCommunityAgentPrompt,
} from '@services/community-agent-prompt-audit'
import { getLockedActiveCommunityMember } from './get-locked-community-member.mts'

export async function updateCommunityAgentPrompt(
  currentUser: PrivateUser,
  promptId: string,
  updates: {
    prompt?: string
  },
): Promise<CommunityAgentPrompt> {
  const existing = await getCommunityAgentPrompt(promptId)
  assert(existing, 404, 'Prompt not found')
  const community = await getCommunity(existing.community_id)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  const trimmedPrompt = updates.prompt?.trim()
  if (trimmedPrompt !== undefined) {
    assert(
      trimmedPrompt.length >= 1 && trimmedPrompt.length <= 10000,
      422,
      'prompt must be between 1 and 10000 characters',
    )
  }

  await using query = await beginTransaction()

  const options = { query }
  const membership = await getLockedActiveCommunityMember(
    existing.community_id,
    currentUser.id,
    options,
  )
  const canUpdate =
    existing.created_by_id === currentUser.id &&
    (currentUser.roles.includes('administrator') || membership !== null)
  assert(canUpdate, 403, 'Forbidden')

  const updateResult = await write(
    sql`/* updateCommunityAgentPrompt */
    WITH updated_prompt AS (
      UPDATE agent_prompts
      SET prompt = COALESCE(${trimmedPrompt ?? null}, prompt),
          updated_at = CURRENT_TIMESTAMP,
          updated_by_id = ${currentUser.id}
      WHERE id = ${promptId}
        AND deleted_at IS NULL
      RETURNING *
    )
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
      up.agent_id,
      up.prompt,
      up.model_name,
      up.model_provider,
      up.created_at,
      up.updated_at
    FROM community_agent_prompts cap
    JOIN updated_prompt up ON up.id = cap.id
    WHERE cap.created_by_id = ${currentUser.id}
      AND cap.deleted_at IS NULL
    `,
    options,
  )

  await query.commit()
  const { rows } = updateResult

  assert(rows[0], 404, 'Prompt not found')
  const updated = rows[0] as CommunityAgentPrompt

  const prev = snapshotCommunityAgentPrompt(existing)
  const next = snapshotCommunityAgentPrompt(updated)
  if (JSON.stringify(prev) !== JSON.stringify(next)) {
    await recordCommunityAgentPromptChange(
      currentUser.id,
      existing.community_id,
      promptId,
      'updated',
      prev,
      next,
    )
  }

  return updated
}
