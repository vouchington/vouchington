import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunityAgentPrompt } from './get.mts'
import { getCommunity } from '@services/communities'
import { getSlotLimitForMembership } from './slots.mts'
import { getMembershipByUserId } from '@services/memberships/get'
import { hasPlusTier } from '@modules/membership-helpers'
import {
  recordCommunityAgentPromptChange,
  snapshotCommunityAgentPrompt,
} from '@services/community-agent-prompt-audit'

export async function allocateCommunityAgentPromptSlot(
  currentUserId: string,
  promptId: string,
): Promise<void> {
  const prompt = await getCommunityAgentPrompt(promptId)
  assert(prompt, 404, 'Prompt not found')
  const community = await getCommunity(prompt.community_id)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  assert(prompt.created_by_id === currentUserId, 403, 'Forbidden')
  assert(!prompt.slot_allocated, 422, 'Slot already allocated')
  assert(!prompt.deleted_at, 404, 'Prompt not found')

  const membership = await getMembershipByUserId(currentUserId)
  const slotLimit = getSlotLimitForMembership(hasPlusTier(membership) ? membership?.plan : null)
  assert(slotLimit > 0, 403, 'A paid membership is required to allocate agent prompt slots')

  await using query = await beginTransaction()
  // Lock ALL of the user's non-deleted prompts to serialize concurrent allocation attempts.
  // Without this, two concurrent requests on different prompts would both see usedSlots=0
  // (each only locking its own target row) and both exceed the limit unchecked.
  const { rows: lockedRows } = await query(sql`/* allocateCommunityAgentPromptSlot */
    SELECT id, slot_allocated FROM community_agent_prompts
    WHERE created_by_id = ${currentUserId}
      AND deleted_at IS NULL
    ORDER BY id
    FOR UPDATE
  `)

  // Count allocated slots excluding the target prompt itself
  const usedSlots = lockedRows.filter(r => r.slot_allocated && r.id !== promptId).length
  assert(usedSlots < slotLimit, 422, `Slot limit reached (${usedSlots}/${slotLimit})`)

  const { rows: updated } = await query(sql`/* allocateCommunityAgentPromptSlot */
    UPDATE community_agent_prompts
    SET slot_allocated = true,
        activated_at = CURRENT_TIMESTAMP,
        deactivated_at = NULL
    WHERE id = ${promptId}
      AND created_by_id = ${currentUserId}
      AND slot_allocated = false
      AND deleted_at IS NULL
    RETURNING id
  `)
  assert(updated.length === 1, 422, 'Prompt could not be allocated')

  await query.commit()

  const afterPrompt = await getCommunityAgentPrompt(promptId)
  if (afterPrompt) {
    await recordCommunityAgentPromptChange(
      currentUserId,
      prompt.community_id,
      promptId,
      'allocated',
      snapshotCommunityAgentPrompt(prompt),
      snapshotCommunityAgentPrompt(afterPrompt),
    )
  }
}

export async function deallocateCommunityAgentPromptSlot(
  currentUserId: string,
  promptId: string,
): Promise<void> {
  const prompt = await getCommunityAgentPrompt(promptId)
  assert(prompt, 404, 'Prompt not found')
  const community = await getCommunity(prompt.community_id)
  assert(community, 404, 'Community not found')
  assert(prompt.created_by_id === currentUserId, 403, 'Forbidden')
  assert(prompt.slot_allocated, 422, 'Slot not allocated')

  await write(
    sql`/* deallocateCommunityAgentPromptSlot */
    UPDATE community_agent_prompts
    SET slot_allocated = false,
        activated_at = NULL,
        deactivated_at = CURRENT_TIMESTAMP
    WHERE id = ${promptId}
      AND created_by_id = ${currentUserId}
      AND slot_allocated = true
      AND deleted_at IS NULL
    `,
  )

  const afterPrompt = await getCommunityAgentPrompt(promptId)
  if (afterPrompt) {
    await recordCommunityAgentPromptChange(
      currentUserId,
      prompt.community_id,
      promptId,
      'deallocated',
      snapshotCommunityAgentPrompt(prompt),
      snapshotCommunityAgentPrompt(afterPrompt),
    )
  }
}
