import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ModeratorActionType } from './config.mts'

export interface RecordModeratorActionInput {
  actionType: ModeratorActionType
  communityId?: string | null
  postId?: string | null
  targetUserId?: string | null
  reportId?: string | null
  reviewDisputeId?: string | null
  moderationAppealId?: string | null
  communityApplicationId?: string | null
  topicClaimId?: string | null
  reportIntegrityFlagId?: string | null
  reportAbusePenaltyId?: string | null
  voteIntegrityFlagId?: string | null
  voteWeightPenaltyId?: string | null
  agentModerationId?: string | null
  agentModerationPostId?: string | null
  oauthClientId?: string | null
  userModNoteId?: string | null
  crawlerId?: string | null
  topicId?: string | null
  operationRequestId?: string | null
  queueName?: string | null
  scheduledJobKey?: string | null
  backfillKey?: string | null
  rssCategoryText?: string | null
  adminImportBatchId?: string | null
  reason?: string | null
  /** Community restrictions this action activated or lifted; stored as child rows, not metadata. */
  communityRestrictionIds?: string[]
  metadata?: Record<string, unknown>
}

export type RecordModeratorActionsInput = Omit<
  RecordModeratorActionInput,
  'communityRestrictionIds'
>

const INSERT_COLUMNS = `actor_id, action_type, community_id, post_id, target_user_id, report_id, review_dispute_id, moderation_appeal_id, community_application_id, topic_claim_id, report_integrity_flag_id, report_abuse_penalty_id, vote_integrity_flag_id, vote_weight_penalty_id, agent_moderation_id, agent_moderation_post_id, oauth_client_id, user_mod_note_id, crawler_id, topic_id, operation_request_id, queue_name, scheduled_job_key, backfill_key, rss_category_text, admin_import_batch_id, reason, metadata`

function actionRow(actorId: string | null, input: RecordModeratorActionsInput) {
  return {
    actor_id: actorId,
    action_type: input.actionType,
    community_id: input.communityId ?? null,
    post_id: input.postId ?? null,
    target_user_id: input.targetUserId ?? null,
    report_id: input.reportId ?? null,
    review_dispute_id: input.reviewDisputeId ?? null,
    moderation_appeal_id: input.moderationAppealId ?? null,
    community_application_id: input.communityApplicationId ?? null,
    topic_claim_id: input.topicClaimId ?? null,
    report_integrity_flag_id: input.reportIntegrityFlagId ?? null,
    report_abuse_penalty_id: input.reportAbusePenaltyId ?? null,
    vote_integrity_flag_id: input.voteIntegrityFlagId ?? null,
    vote_weight_penalty_id: input.voteWeightPenaltyId ?? null,
    agent_moderation_id: input.agentModerationId ?? null,
    agent_moderation_post_id: input.agentModerationPostId ?? null,
    oauth_client_id: input.oauthClientId ?? null,
    user_mod_note_id: input.userModNoteId ?? null,
    crawler_id: input.crawlerId ?? null,
    topic_id: input.topicId ?? null,
    operation_request_id: input.operationRequestId ?? null,
    queue_name: input.queueName ?? null,
    scheduled_job_key: input.scheduledJobKey ?? null,
    backfill_key: input.backfillKey ?? null,
    rss_category_text: input.rssCategoryText ?? null,
    admin_import_batch_id: input.adminImportBatchId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  }
}

export async function recordModeratorAction(
  actorId: string | null,
  input: RecordModeratorActionInput,
  options?: QueryOptions,
): Promise<string> {
  const insert = sql`/* recordModeratorAction */ WITH inserted AS (INSERT INTO moderator_actions (`
  insert.append(INSERT_COLUMNS).append(') SELECT ').append(INSERT_COLUMNS)
  insert.append(sql` FROM jsonb_populate_recordset(NULL::moderator_actions, ${JSON.stringify([actionRow(actorId, input)])}::jsonb)
    RETURNING id
  ), restrictions AS (
    INSERT INTO moderator_action_community_restrictions (moderator_action_id, community_restriction_id)
    SELECT inserted.id, restriction.id FROM inserted
    CROSS JOIN UNNEST(${[...new Set(input.communityRestrictionIds ?? [])]}::uuid[]) AS restriction(id)
  ) SELECT id FROM inserted`)
  const { rows } = await write<{ id: string }>(insert, options)
  return rows[0]!.id
}

export async function recordModeratorActions(
  actorId: string | null,
  inputs: RecordModeratorActionsInput[],
  options?: QueryOptions,
): Promise<void> {
  if (inputs.length === 0) return
  const insert = sql`/* recordModeratorActions */ INSERT INTO moderator_actions (`
  insert.append(INSERT_COLUMNS).append(') SELECT ').append(INSERT_COLUMNS)
  insert.append(
    sql` FROM jsonb_populate_recordset(NULL::moderator_actions, ${JSON.stringify(inputs.map(input => actionRow(actorId, input)))}::jsonb)`,
  )
  await write(insert, options)
}
