import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  recordCommunityAgentPromptChange,
  snapshotCommunityAgentPrompt,
} from '@services/community-agent-prompt-audit'
import type { CommunityAgentPrompt } from './types.mts'

/**
 * Deactivates and frees all allocated prompt slots for a user in a community.
 * Called when a moderator is removed or demoted.
 * @param actorUserId - The user performing the removal/demotion (attributed in audit log).
 * @param userId - The moderator whose prompts are being deactivated.
 */
export async function deactivateCommunityPromptsForUser(
  actorUserId: string,
  userId: string,
  communityId: string,
): Promise<void> {
  // Use a transaction so both the snapshot read and the update run on the write pool,
  // preventing replica-lag from causing a missed deactivation.
  await using query = await beginTransaction()

  const { rows } = await query<CommunityAgentPrompt>(
    sql`/* deactivateCommunityPromptsForUser */
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
      WHERE cap.created_by_id = ${userId}
        AND cap.community_id = ${communityId}
        AND cap.slot_allocated = true
        AND cap.deleted_at IS NULL
        AND ap.deleted_at IS NULL
      `,
  )

  if (rows.length === 0) {
    await query.commit()
    return
  }
  await query(
    sql`/* deactivateCommunityPromptsForUser */
      UPDATE community_agent_prompts
      SET slot_allocated = false,
          activated_at = NULL,
          deactivated_at = CURRENT_TIMESTAMP
      WHERE created_by_id = ${userId}
        AND community_id = ${communityId}
        AND slot_allocated = true
        AND deleted_at IS NULL
      `,
  )

  const deactivatedAt = new Date().toISOString()
  await query.commit()
  await Promise.all(
    rows.map(prompt =>
      recordCommunityAgentPromptChange(
        actorUserId,
        communityId,
        prompt.id,
        'deactivated',
        snapshotCommunityAgentPrompt(prompt),
        {
          ...snapshotCommunityAgentPrompt(prompt),
          slot_allocated: false,
          activated_at: null,
          deactivated_at: deactivatedAt,
        },
      ),
    ),
  )
}
