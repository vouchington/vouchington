import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityAgentPrompt } from './types.mts'
import { getCommunityAgentPrompt } from './get.mts'
import { getCommunity } from '@services/communities'
import { getSlotLimitForMembership } from './slots.mts'
import { getMembershipByUserId } from '@services/memberships/get'
import { hasPlusTier } from '@modules/membership-helpers'
import {
  recordCommunityAgentPromptChange,
  snapshotCommunityAgentPrompt,
} from '@services/community-agent-prompt-audit'

type SlotState = Pick<CommunityAgentPrompt, 'is_slot_allocated' | 'activated_at' | 'deactivated_at'>

/** `prompt` is the row the caller already loaded and authorized against the community. */
export async function allocateCommunityAgentPromptSlot(
  currentUserId: string,
  prompt: CommunityAgentPrompt,
): Promise<void> {
  const promptId = prompt.id
  const community = await getCommunity(prompt.community_id)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  assert(prompt.created_by_id === currentUserId, 403, 'Forbidden')
  assert(!prompt.is_slot_allocated, 422, 'Slot already allocated')
  assert(!prompt.deleted_at, 404, 'Prompt not found')

  const membership = await getMembershipByUserId(currentUserId)
  const slotLimit = getSlotLimitForMembership(hasPlusTier(membership) ? membership?.plan : null)
  assert(slotLimit > 0, 403, 'A paid membership is required to allocate agent prompt slots')

  await using query = await beginTransaction()
  // Lock ALL of the user's non-deleted prompts to serialize concurrent allocation attempts.
  // Without this, two concurrent requests on different prompts would both see usedSlots=0
  // (each only locking its own target row) and both exceed the limit unchecked.
  const { rows: lockedRows } = await query(sql`/* allocateCommunityAgentPromptSlot */
    SELECT id, is_slot_allocated FROM community_agent_prompts
    WHERE created_by_id = ${currentUserId}
      AND deleted_at IS NULL
    ORDER BY id
    FOR UPDATE
  `)

  // Count allocated slots excluding the target prompt itself
  const usedSlots = lockedRows.filter(r => r.is_slot_allocated && r.id !== promptId).length
  assert(usedSlots < slotLimit, 422, `Slot limit reached (${usedSlots}/${slotLimit})`)

  const { rows: updated } = await query(sql`/* allocateCommunityAgentPromptSlot */
    UPDATE community_agent_prompts
    SET is_slot_allocated = true,
        activated_at = CURRENT_TIMESTAMP,
        deactivated_at = NULL
    WHERE id = ${promptId}
      AND created_by_id = ${currentUserId}
      AND is_slot_allocated = false
      AND deleted_at IS NULL
    RETURNING is_slot_allocated, activated_at, deactivated_at
  `)
  assert(updated.length === 1, 422, 'Prompt could not be allocated')

  await query.commit()

  await recordCommunityAgentPromptChange(
    currentUserId,
    prompt.community_id,
    promptId,
    'allocated',
    snapshotCommunityAgentPrompt(prompt),
    snapshotCommunityAgentPrompt({ ...prompt, ...(updated[0] as SlotState) }),
  )
}

/** `prompt` is the row the caller already loaded and authorized against the community. */
export async function deallocateCommunityAgentPromptSlot(
  currentUserId: string,
  prompt: CommunityAgentPrompt,
): Promise<void> {
  const promptId = prompt.id
  const community = await getCommunity(prompt.community_id)
  assert(community, 404, 'Community not found')
  assert(prompt.created_by_id === currentUserId, 403, 'Forbidden')
  assert(prompt.is_slot_allocated, 422, 'Slot not allocated')

  const { rows: updated } = await write(
    sql`/* deallocateCommunityAgentPromptSlot */
    UPDATE community_agent_prompts
    SET is_slot_allocated = false,
        activated_at = NULL,
        deactivated_at = CURRENT_TIMESTAMP
    WHERE id = ${promptId}
      AND created_by_id = ${currentUserId}
      AND is_slot_allocated = true
      AND deleted_at IS NULL
    RETURNING is_slot_allocated, activated_at, deactivated_at
    `,
  )

  // A concurrent change can leave the guard matching nothing; the audit then records the state
  // that won, as before, so only that case reads the row back.
  const afterPrompt = updated[0]
    ? { ...prompt, ...(updated[0] as SlotState) }
    : await getCommunityAgentPrompt(promptId)
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
