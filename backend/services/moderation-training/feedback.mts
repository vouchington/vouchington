import assert from 'http-assert'
import sql from 'sql-template-strings'
import { write, type QueryOptions } from '@data-stores/psql'
import type { ModerationTrainingFeedback, RecordModerationTrainingFeedbackInput } from './types.mts'

export async function recordModerationTrainingFeedback(
  input: RecordModerationTrainingFeedbackInput,
  options?: QueryOptions,
): Promise<ModerationTrainingFeedback> {
  assert(input.humanAction.trim() === input.humanAction, 422, 'humanAction must be trimmed')
  assert(
    input.humanAction.length > 0 && input.humanAction.length <= 120,
    422,
    'humanAction invalid',
  )
  assert(
    input.reasonCode == null ||
      (input.reasonCode.trim() === input.reasonCode && input.reasonCode.length <= 120),
    422,
    'reasonCode invalid',
  )
  const confidence = input.labelConfidence ?? 1
  const note = input.note == null ? null : input.note.slice(0, 2000)
  assert(confidence >= 0 && confidence <= 1, 422, 'labelConfidence invalid')

  const { rows } = await write(
    sql`/* recordModerationTrainingFeedback */
      INSERT INTO moderation_training_feedbacks (
        source_type,
        event_type,
        label,
        human_action,
        reason_code,
        note,
        label_confidence,
        actor_user_id,
        community_id,
        post_id,
        agent_moderation_id,
        moderation_report_id,
        moderation_appeal_id,
        review_dispute_id,
        post_clearance_change_id,
        input_sha256,
        metadata
      )
      VALUES (
        ${input.sourceType},
        ${input.eventType},
        ${input.label},
        ${input.humanAction},
        ${input.reasonCode ?? null},
        ${note},
        ${confidence},
        ${input.actorUserId ?? null},
        ${input.communityId ?? null},
        ${input.postId ?? null},
        ${input.agentModerationId ?? null},
        ${input.moderationReportId ?? null},
        ${input.moderationAppealId ?? null},
        ${input.reviewDisputeId ?? null},
        ${input.postClearanceChangeId ?? null},
        ${input.inputSha256 ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
      RETURNING *
    `,
    undefined,
    options,
  )

  return rows[0] as ModerationTrainingFeedback
}
