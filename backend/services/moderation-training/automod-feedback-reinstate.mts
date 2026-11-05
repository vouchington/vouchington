import sql from 'sql-template-strings'
import { reviveClassifierRunRequests } from '@services/classifier-run-revival'
import { recordModeratorAction } from '@services/moderator-actions'
import { recordPostPublicationChange } from '@services/post-publication'
import { hasOtherActiveAutomodSignals } from './active-signals.mts'
import { getAutomodFeedbackContext } from './automod-feedback-context.mts'
import { parseAutomodActionSourceKey } from './recent-actions.mts'
import type { RecordAutomodActionFeedbackInput } from './automod-feedback.mts'

type AutomodFeedbackContext = NonNullable<Awaited<ReturnType<typeof getAutomodFeedbackContext>>>
type ParsedAutomodSource = NonNullable<ReturnType<typeof parseAutomodActionSourceKey>>
type FeedbackQuery = Parameters<typeof recordPostPublicationChange>[0]

export async function applyAutomodReinstate(
  query: FeedbackQuery,
  input: RecordAutomodActionFeedbackInput,
  context: AutomodFeedbackContext,
  parsed: ParsedAutomodSource,
): Promise<boolean> {
  let appliedAction = true
  const hasOtherActiveSignals = await hasOtherActiveAutomodSignals({
    communityId: input.communityId,
    postId: context.post_id,
    sourceType: parsed.sourceType,
    sourceId: parsed.id,
    inputSha256: parsed.inputSha256,
    query,
  })
  if (hasOtherActiveSignals) {
    appliedAction = false
  } else if (parsed.sourceType === 'community_prompt') {
    const reinstateResult = await query(sql`/* recordAutomodActionFeedback:reinstateCommunityPost */
          UPDATE community_post_reviews
          SET unpublished_at = NULL,
              unpublished_by_id = NULL
          WHERE community_id = ${input.communityId}
            AND post_id = ${context.post_id}
            AND unpublished_at IS NOT NULL
            AND unpublished_by_id IS NULL
        `)
    if ((reinstateResult.rowCount ?? 0) === 0) {
      appliedAction = false
    } else {
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId: context.post_id },
        reason: 'community_publication_changed',
        impactedCommunityIds: [input.communityId],
        footprint: { priorCommunityId: input.communityId },
      })
    }
  } else {
    const reinstateResult = await query<{
      input_sha256: Buffer | null
    }>(sql`/* recordAutomodActionFeedback:reinstatePostClearance */
          WITH target_post AS (
            SELECT id
            FROM posts
            WHERE id = ${context.post_id}
              AND (in_review_at IS NOT NULL OR rejected_at IS NOT NULL)
          ),
          inserted_change AS (
            INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id, metadata)
            SELECT
              target_post.id,
              'approve',
              ${input.actorUserId},
              ${JSON.stringify({ source_key: input.sourceKey, moderation_training: true })}::jsonb
            FROM target_post
            RETURNING id, post_id, created_at, changed_by_id
          )
          UPDATE posts
          SET clearance_version = posts.clearance_version + 1,
              clearance_changed_at = inserted_change.created_at,
              clearance_changed_by_id = inserted_change.changed_by_id,
              clearance_public_reason_code = NULL,
              clearance_is_platform_override = FALSE,
              approved_at = inserted_change.created_at,
              rejected_at = NULL,
              in_review_at = NULL,
              updated_by_id = ${input.actorUserId}
          FROM inserted_change
          WHERE posts.id = inserted_change.post_id
          RETURNING posts.llm_moderation_content_sha256 AS input_sha256
        `)
    if ((reinstateResult.rowCount ?? 0) === 0) {
      appliedAction = false
    } else {
      const inputSha256 = reinstateResult.rows[0]?.input_sha256
      if (inputSha256)
        await reviveClassifierRunRequests(query, {
          subject: { postId: context.post_id, rssFeedItemId: null },
          inputSha256,
        })
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId: context.post_id },
        reason: 'post_clearance_changed',
        footprint: { priorCommunityId: input.communityId },
      })
    }
  }
  if (appliedAction) {
    await recordModeratorAction(
      input.actorUserId,
      {
        actionType: 'approve',
        communityId: input.communityId,
        postId: context.post_id,
        reason: input.note ?? null,
        metadata: { source_key: input.sourceKey, moderation_training: true },
      },
      { query },
    )
  }
  return appliedAction
}
