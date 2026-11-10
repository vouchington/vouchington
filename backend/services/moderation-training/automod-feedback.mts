import assert from 'http-assert'
import { beginTransaction } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  getAutomodFeedbackContext,
  hasExistingAutomodFeedback,
  lockAutomodFeedbackPostRow,
} from './automod-feedback-context.mts'
import { recordModerationTrainingFeedback } from './feedback.mts'
import { parseAutomodActionSourceKey } from './recent-actions.mts'
import { applyAutomodReinstate } from './automod-feedback-reinstate.mts'
import { applyAutomodKeepRemoved } from './automod-feedback-keep-removed.mts'
import type { RecordAutomodActionFeedbackInput } from './automod-feedback-input.mts'

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
  let context = await getAutomodFeedbackContext(
    input.communityId,
    parsed.sourceType,
    parsed.id,
    parsed.inputSha256,
    { query },
  )
  assert(context, 404, 'Automod action not found')
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
      trainingEvidence: 'staff_or_user',
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
    appliedAction = await applyAutomodReinstate(query, input, context, parsed)
  } else if (input.action === 'keep_removed' && parsed.sourceType !== 'community_prompt') {
    await applyAutomodKeepRemoved(query, input, context, parsed)
  }

  const feedback = Object.assign(trainingFeedback, { applied_action: appliedAction })
  await query.commit()
  if (postIdToInvalidate) await invalidate.posts(postIdToInvalidate)
  return feedback
}
