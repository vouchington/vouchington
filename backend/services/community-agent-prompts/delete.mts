import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunityAgentPrompt } from './get.mts'
import { getCommunity } from '@services/communities/get'
import type { PrivateUser } from '@services/users/types'
import {
  recordCommunityAgentPromptChange,
  snapshotCommunityAgentPrompt,
} from '@services/community-agent-prompt-audit'
import { getLockedActiveCommunityMember } from './get-locked-community-member.mts'

export async function deleteCommunityAgentPrompt(
  currentUser: PrivateUser,
  promptId: string,
): Promise<void> {
  const prompt = await getCommunityAgentPrompt(promptId)
  assert(prompt, 404, 'Prompt not found')
  const community = await getCommunity(prompt.community_id)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')

  await using query = await beginTransaction()
  const options = { query }
  const membership = await getLockedActiveCommunityMember(
    prompt.community_id,
    currentUser.id,
    options,
  )
  const canDeleteOwnPrompt = membership !== null && prompt.created_by_id === currentUser.id
  const canDeleteAnyPrompt =
    currentUser.roles.includes('administrator') || membership?.role === 'owner'
  assert(canDeleteOwnPrompt || canDeleteAnyPrompt, 403, 'Forbidden')

  await write(
    sql`/* deleteCommunityAgentPrompt */
  WITH deleted_cap AS (
    UPDATE community_agent_prompts
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = ${currentUser.id},
        slot_allocated = false,
        activated_at = NULL,
        deactivated_at = CASE WHEN activated_at IS NOT NULL AND deactivated_at IS NULL THEN CURRENT_TIMESTAMP ELSE deactivated_at END
    WHERE id = ${promptId}
      AND deleted_at IS NULL
    RETURNING id
  )
  UPDATE agent_prompts
  SET deleted_at = CURRENT_TIMESTAMP,
      deleted_by_id = ${currentUser.id}
  WHERE id IN (SELECT id FROM deleted_cap)
  `,
    options,
  )

  await query.commit()

  await recordCommunityAgentPromptChange(
    currentUser.id,
    prompt.community_id,
    promptId,
    'deleted',
    snapshotCommunityAgentPrompt(prompt),
    {},
  )
}
