import { read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function readTestCommunityPostReviewHistory(postId: string) {
  const { rows } = await read<{
    action: string
    actor_user_id: string
    is_platform_override: boolean
  }>(
    sql`/* readTestCommunityPostReviewHistory */
    SELECT change_type AS action, changed_by_id AS actor_user_id, is_platform_override FROM community_post_review_changes
    WHERE post_id = ${postId} ORDER BY id`,
  )
  return rows
}

/** A moderator dismissal, which the schema only allows on a review-queue flag. */
export async function dismissTestCommunityPostReviewAutomodFlag(
  postId: string,
  dismissedById: string,
): Promise<void> {
  await write(sql`/* dismissTestCommunityPostReviewAutomodFlag */
    UPDATE community_post_reviews
    SET automod_dismissed_at = now(), automod_dismissed_by_id = ${dismissedById}
    WHERE post_id = ${postId}`)
}

export async function countTestRemoveModeratorActions(postId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestRemoveModeratorActions */
    SELECT count(*)::integer AS count FROM moderator_actions
    WHERE post_id = ${postId} AND action_type = 'remove'`)
  return rows[0]!.count
}

export async function activateTestCommunityAgentPromptHoursAgo(
  promptId: string,
  hoursAgo: number,
): Promise<void> {
  await write(sql`/* activateTestCommunityAgentPromptHoursAgo */
    UPDATE community_agent_prompts
    SET activated_at = now() - ${hoursAgo} * interval '1 hour'
    WHERE id = ${promptId}`)
}

/** Deactivates on the caller's transaction, so only that transaction sees the prompt gone. */
export async function deactivateTestCommunityAgentPromptInTransaction(
  query: TransactionQuery,
  promptId: string,
): Promise<void> {
  await query(sql`/* deactivateTestCommunityAgentPromptInTransaction */
    UPDATE community_agent_prompts
    SET is_slot_allocated = false, activated_at = NULL, deactivated_at = now()
    WHERE id = ${promptId}`)
}
