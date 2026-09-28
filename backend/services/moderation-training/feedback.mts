import assert from 'http-assert'
import sql from 'sql-template-strings'
import { write, type QueryOptions } from '@data-stores/psql'
import { trainingMetadataFacts } from './metadata-facts.mts'
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
  const metadata = input.metadata ?? {}
  const facts = trainingMetadataFacts(metadata)

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
        metadata_source_key,
        metadata_outcome,
        metadata_source_type,
        metadata_score,
        metadata_score_present,
        metadata_recommended_action,
        metadata_reason,
        metadata_report_entity_type,
        metadata_report_reason,
        metadata_report_post_id,
        metadata_report_user_id,
        metadata_report_hostname_id,
        metadata_report_rss_feed_item_id,
        metadata_community_trusted,
        metadata_community_trusted_present,
        metadata_clearance_status,
        metadata_prompt_id,
        metadata_prompt_model_name,
        metadata_prompt_model_provider,
        metadata_test_text,
        metadata_expected_flagged,
        metadata_expected_flagged_present,
        metadata_expected_reason,
        metadata_actual_flagged,
        metadata_actual_flagged_present,
        metadata_actual_reason
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
        ${facts.sourceKey},
        ${facts.outcome},
        ${facts.sourceType},
        ${facts.score},
        ${facts.scorePresent},
        ${facts.recommendedAction},
        ${facts.reason},
        ${facts.reportEntityType},
        ${facts.reportReason},
        ${facts.reportPostId},
        ${facts.reportUserId},
        ${facts.reportHostnameId},
        ${facts.reportRssFeedItemId},
        ${facts.communityTrusted},
        ${facts.communityTrustedPresent},
        ${facts.clearanceStatus},
        ${facts.promptId},
        ${facts.promptModelName},
        ${facts.promptModelProvider},
        ${facts.testText},
        ${facts.expectedFlagged},
        ${facts.expectedFlaggedPresent},
        ${facts.expectedReason},
        ${facts.actualFlagged},
        ${facts.actualFlaggedPresent},
        ${facts.actualReason}
      )
      RETURNING
        id, source_type, event_type, label, human_action, reason_code, note,
        label_confidence, actor_user_id, community_id, post_id, agent_moderation_id,
        moderation_report_id, moderation_appeal_id, review_dispute_id,
        post_clearance_change_id, input_sha256, created_at, updated_at
    `,
    undefined,
    options,
  )

  return { ...(rows[0] as Omit<ModerationTrainingFeedback, 'metadata'>), metadata }
}
