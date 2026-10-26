import { read, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

type FeedbackSource = 'moderation_report' | 'moderation_appeal' | 'review_dispute'

/** Executor for focused retention service tests; fixture SQL remains in this helper module. */
export const testModerationRetentionWrite: QueryExecutor = write

/** Creates an old, post-linked false-positive label to prove source deletion keeps suppression. */
export async function insertTestRetentionFeedback(input: {
  sourceType: FeedbackSource
  sourceId: string
  postId: string
  createdAt: Date
}): Promise<string> {
  const id = uuidv7({ msecs: input.createdAt.getTime() })
  const reportId = input.sourceType === 'moderation_report' ? input.sourceId : null
  const appealId = input.sourceType === 'moderation_appeal' ? input.sourceId : null
  const disputeId = input.sourceType === 'review_dispute' ? input.sourceId : null
  const eventType =
    input.sourceType === 'moderation_report'
      ? 'report_resolved'
      : input.sourceType === 'moderation_appeal'
        ? 'appeal_resolved'
        : 'dispute_resolved'
  const humanAction =
    input.sourceType === 'moderation_report'
      ? 'report_reviewed'
      : input.sourceType === 'moderation_appeal'
        ? 'resolve_accept'
        : 'resolve_remove'
  await write(sql`/* insertTestRetentionFeedback */
    INSERT INTO moderation_training_feedbacks (
      id, source_type, event_type, label, human_action, post_id,
      moderation_report_id, moderation_appeal_id, review_dispute_id
    ) VALUES (
      ${id}::uuid, ${input.sourceType}::moderation_training_source_types,
      ${eventType}::moderation_training_event_types, 'false_positive',
      ${humanAction}::moderation_training_human_actions, ${input.postId}::uuid,
      ${reportId}::uuid, ${appealId}::uuid, ${disputeId}::uuid
    )
  `)
  return id
}

export async function getTestRetentionFeedback(id: string): Promise<{
  source_type: FeedbackSource
  moderation_report_id: string | null
  moderation_appeal_id: string | null
  review_dispute_id: string | null
} | null> {
  const { rows } = await read<{
    source_type: FeedbackSource
    moderation_report_id: string | null
    moderation_appeal_id: string | null
    review_dispute_id: string | null
  }>(sql`/* getTestRetentionFeedback */
    SELECT source_type, moderation_report_id, moderation_appeal_id, review_dispute_id
    FROM moderation_training_feedbacks WHERE id = ${id}::uuid
  `)
  return rows[0] ?? null
}

export async function resolveTestRetentionReport(id: string, at: Date): Promise<void> {
  await write(sql`/* resolveTestRetentionReport */
    UPDATE moderation_reports SET reviewed_at = ${at}, resolution_action = 'reviewed'
    WHERE id = ${id}::uuid
  `)
}

export async function resolveTestRetentionDispute(id: string, at: Date): Promise<void> {
  await write(sql`/* resolveTestRetentionDispute */
    UPDATE review_disputes SET resolved_at = ${at}, resolution_action = 'no_action'
    WHERE id = ${id}::uuid
  `)
}

export async function revokeTestRetentionWarning(id: string, at: Date): Promise<void> {
  await write(sql`/* revokeTestRetentionWarning */
    UPDATE user_warnings SET revoked_at = ${at} WHERE id = ${id}::uuid
  `)
}

export async function resolveTestRetentionCaseForReport(
  reportId: string,
  at: Date,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* resolveTestRetentionCaseForReport */
    UPDATE moderation_cases SET resolved_at = ${at}
    WHERE id = (SELECT case_id FROM moderation_reports WHERE id = ${reportId}::uuid)
    RETURNING id
  `)
  if (!rows[0]) throw new Error('Test report has no moderation case')
  return rows[0].id
}

export async function dispatchTestRetentionJudgement(id: string, at: Date): Promise<void> {
  await write(sql`/* dispatchTestRetentionJudgement */
    UPDATE moderation_report_judgements SET dispatched_at = ${at} WHERE id = ${id}::uuid
  `)
}

export async function liftTestRetentionSuspension(id: string, at: Date): Promise<void> {
  await write(sql`/* liftTestRetentionSuspension */
    UPDATE user_suspensions SET lifted_at = ${at} WHERE id = ${id}::uuid
  `)
}

export async function deleteTestRetentionNote(id: string, at: Date): Promise<void> {
  await write(sql`/* deleteTestRetentionNote */
    UPDATE user_moderator_notes SET deleted_at = ${at} WHERE id = ${id}::uuid
  `)
}

export async function approveTestRetentionApplication(id: string, at: Date): Promise<void> {
  await write(sql`/* approveTestRetentionApplication */
    UPDATE community_applications
    SET reviewed_at = ${at}, approved_at = ${at}
    WHERE id = ${id}::uuid
  `)
}
