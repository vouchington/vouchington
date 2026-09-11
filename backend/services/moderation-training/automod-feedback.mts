/* oxlint-disable max-lines -- Automod feedback keeps source locking, feedback recording, and action application in one transaction. */
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { beginTransaction } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import { recordModeratorAction } from '@services/moderator-actions'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import { hasOtherActiveAutomodSignals } from './active-signals.mts'
import {
  getAutomodFeedbackContext,
  hasExistingAutomodFeedback,
  lockAutomodFeedbackPost,
  lockAutomodFeedbackPostRow,
  lockAutomodFeedbackSource,
} from './automod-feedback-context.mts'
import { clearFalsePositivePostLevelFlags } from './post-level-flags.mts'
import { recordModerationTrainingFeedback } from './feedback.mts'
import { parseAutomodActionSourceKey } from './recent-actions.mts'

export type AutomodFeedbackOutcome = 'false_positive' | 'true_positive'
export type AutomodFeedbackAction = 'reinstate' | 'keep_removed' | 'label_only'

export type RecordAutomodActionFeedbackInput = {
  communityId: string
  sourceKey: string
  actorUserId: string
  outcome: AutomodFeedbackOutcome
  action: AutomodFeedbackAction
  reasonCode?: string | null
  note?: string | null
}

export async function recordAutomodActionFeedback(input: RecordAutomodActionFeedbackInput) {
  const parsed = parseAutomodActionSourceKey(input.sourceKey)
  assert(parsed, 422, 'Invalid source key')
  assert(
    input.action !== 'reinstate' || input.outcome === 'false_positive',
    422,
    'Only false positives can be reinstated',
  )
  assert(
    input.action !== 'keep_removed' || input.outcome === 'true_positive',
    422,
    'Only true positives can be kept removed',
  )
  let postIdToInvalidate: string | null = null
  await using query = await beginTransaction()
  await lockAutomodFeedbackSource(input.communityId, input.sourceKey, query)
  let context = await getAutomodFeedbackContext(
    input.communityId,
    parsed.sourceType,
    parsed.id,
    parsed.inputSha256,
    { query },
  )
  assert(context, 404, 'Automod action not found')
  await lockPostPublication(query, context.post_id)
  await lockAutomodFeedbackPost(input.communityId, context.post_id, query)
  assert(
    await lockAutomodFeedbackPostRow(context.post_id, query),
    409,
    'Automod action state changed',
  )
  context = await getAutomodFeedbackContext(
    input.communityId,
    parsed.sourceType,
    parsed.id,
    parsed.inputSha256,
    { query },
  )
  assert(context, 409, 'Automod action state changed')
  assert(
    !(await hasExistingAutomodFeedback({
      sourceType: parsed.sourceType,
      postId: context.post_id,
      agentModerationId: context.agent_moderation_id,
      inputSha256: context.input_sha256,
      query,
    })),
    409,
    'Automod action already reviewed',
  )
  postIdToInvalidate = context.post_id

  const trainingFeedback = await recordModerationTrainingFeedback(
    {
      sourceType: parsed.sourceType,
      eventType: 'automod_reviewed',
      label: input.outcome === 'false_positive' ? 'false_positive' : 'true_positive',
      humanAction: input.action,
      reasonCode: input.reasonCode ?? null,
      note: input.note ?? null,
      labelConfidence: 1,
      actorUserId: input.actorUserId,
      communityId: input.communityId,
      postId: context.post_id,
      agentModerationId: context.agent_moderation_id,
      inputSha256: context.input_sha256,
      metadata: {
        source_key: input.sourceKey,
        outcome: input.outcome,
        source_type: parsed.sourceType,
      },
    },
    { query },
  )

  let appliedAction = true
  if (input.action === 'reinstate') {
    const hasOtherActiveSignals = await hasOtherActiveAutomodSignals({
      communityId: input.communityId,
      postId: context.post_id,
      sourceKey: input.sourceKey,
      query,
    })
    if (hasOtherActiveSignals) {
      appliedAction = false
    } else if (parsed.sourceType === 'community_prompt') {
      const reinstateResult =
        await query(sql`/* recordAutomodActionFeedback:reinstateCommunityPost */
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
      const reinstateResult =
        await query(sql`/* recordAutomodActionFeedback:reinstatePostClearance */
          WITH target_post AS (
            SELECT id
            FROM posts
            WHERE id = ${context.post_id}
              AND (in_review_at IS NOT NULL OR rejected_at IS NOT NULL)
          ),
          inserted_change AS (
            INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id, note, metadata)
            SELECT
              target_post.id,
              'approve',
              ${input.actorUserId},
              ${input.note ?? null},
              ${JSON.stringify({ source_key: input.sourceKey, moderation_training: true })}::jsonb
            FROM target_post
            RETURNING id, post_id, created_at
          )
          UPDATE posts
          SET latest_clearance_change_id = inserted_change.id,
              approved_at = inserted_change.created_at,
              rejected_at = NULL,
              in_review_at = NULL,
              updated_by_id = ${input.actorUserId}
          FROM inserted_change
          WHERE posts.id = inserted_change.post_id
        `)
      if ((reinstateResult.rowCount ?? 0) === 0) {
        appliedAction = false
      } else {
        await recordPostPublicationChange(query, {
          scope: { type: 'post', postId: context.post_id },
          reason: 'post_clearance_changed',
          footprint: { priorCommunityId: input.communityId },
        })
        await clearFalsePositivePostLevelFlags(context.post_id, query)
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
  } else if (input.action === 'keep_removed' && parsed.sourceType !== 'community_prompt') {
    const rejectResult = await query(sql`/* recordAutomodActionFeedback:rejectInReviewPost */
        WITH inserted_change AS (
          INSERT INTO post_clearance_changes (
            post_id,
            change_type,
            changed_by_id,
            note,
            metadata,
            moderation_transparency_categories
          )
          SELECT
            ${context.post_id},
            'reject',
            ${input.actorUserId},
            ${input.note ?? null},
            ${JSON.stringify({ source_key: input.sourceKey, moderation_training: true })}::jsonb,
            array_remove(
              ARRAY[
                CASE WHEN p.openai_omni_moderation_flagged IS TRUE THEN 'openai_omni' END,
                CASE WHEN p.spam_detection_flagged IS TRUE THEN 'spam_detection' END
              ],
              NULL
            )
          FROM posts p
          WHERE p.id = ${context.post_id}
            AND p.in_review_at IS NOT NULL
          RETURNING id, post_id, created_at
        )
        UPDATE posts
        SET latest_clearance_change_id = inserted_change.id,
            approved_at = NULL,
            rejected_at = inserted_change.created_at,
            in_review_at = NULL,
            updated_by_id = ${input.actorUserId}
        FROM inserted_change
        WHERE posts.id = inserted_change.post_id
      `)
    if ((rejectResult.rowCount ?? 0) > 0) {
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId: context.post_id },
        reason: 'post_clearance_changed',
        footprint: { priorCommunityId: input.communityId },
      })
      await recordModeratorAction(
        input.actorUserId,
        {
          actionType: 'reject',
          communityId: input.communityId,
          postId: context.post_id,
          reason: input.note ?? null,
          metadata: { source_key: input.sourceKey, moderation_training: true },
        },
        { query },
      )
    }
  }

  const feedback = Object.assign(trainingFeedback, { applied_action: appliedAction })
  await query.commit()
  if (postIdToInvalidate) await invalidate.posts(postIdToInvalidate)
  return feedback
}
