import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
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

  let slotState: SlotState
  try {
    await using query = await beginTransaction()
    slotState = await allocateCommunityAgentPromptSlotInTransaction(
      currentUserId,
      promptId,
      slotLimit,
      query,
    )
    await query.commit()
  } catch (err) {
    if (isSlotCountLimitViolation(err)) {
      assert(false, 422, `Slot limit reached (${slotLimit}/${slotLimit})`)
    }
    throw err
  }

  await recordCommunityAgentPromptChange(
    currentUserId,
    prompt.community_id,
    promptId,
    'allocated',
    snapshotCommunityAgentPrompt(prompt),
    snapshotCommunityAgentPrompt({ ...prompt, ...slotState }),
  )
}

/** The caller owns the transaction; the prompt transition projects the count before this read. */
export async function allocateCommunityAgentPromptSlotInTransaction(
  creatorUserId: string,
  promptId: string,
  slotLimit: number,
  query: TransactionQuery,
): Promise<SlotState> {
  const { rows: updated } = await query(sql`/* allocateCommunityAgentPromptSlot */
    UPDATE community_agent_prompts
    SET is_slot_allocated = true,
        activated_at = CURRENT_TIMESTAMP,
        deactivated_at = NULL
    WHERE id = ${promptId}
      AND created_by_id = ${creatorUserId}
      AND is_slot_allocated = false
      AND deleted_at IS NULL
    RETURNING is_slot_allocated, activated_at, deactivated_at
  `)
  assert(updated.length === 1, 422, 'Prompt could not be allocated')
  const { rows: counts } = await query<{
    allocated_count: number
  }>(sql`/* allocateCommunityAgentPromptSlot:count */
    SELECT allocated_count FROM community_agent_prompt_slot_counts
    WHERE creator_user_id = ${creatorUserId}
  `)
  const usedSlots = counts[0]?.allocated_count
  assert(usedSlots !== undefined, 500, 'Prompt slot count is missing')
  assert(usedSlots <= slotLimit, 422, `Slot limit reached (${usedSlots - 1}/${slotLimit})`)
  return updated[0] as SlotState
}

function isSlotCountLimitViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23514' &&
    'constraint' in error &&
    error.constraint === 'chk_community_agent_prompt_slot_counts__allocated_count'
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
