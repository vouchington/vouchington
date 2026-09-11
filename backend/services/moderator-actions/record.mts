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
  reason?: string | null
  metadata?: Record<string, unknown>
}

const MODERATOR_ACTION_INSERT_COLUMNS = `(
      actor_id,
      action_type,
      community_id,
      post_id,
      target_user_id,
      report_id,
      review_dispute_id,
      moderation_appeal_id,
      community_application_id,
      reason,
      metadata
    )` as const

export async function recordModeratorAction(
  actorId: string | null,
  input: RecordModeratorActionInput,
  options?: QueryOptions,
): Promise<void> {
  const insert = createModeratorActionInsert('recordModeratorAction')
  insert.append(sql` VALUES (
      ${actorId},
      ${input.actionType},
      ${input.communityId ?? null},
      ${input.postId ?? null},
      ${input.targetUserId ?? null},
      ${input.reportId ?? null},
      ${input.reviewDisputeId ?? null},
      ${input.moderationAppealId ?? null},
      ${input.communityApplicationId ?? null},
      ${input.reason ?? null},
      ${JSON.stringify(input.metadata ?? {})}
    )`)
  await write(insert, options)
}

export async function recordModeratorActions(
  actorId: string | null,
  inputs: RecordModeratorActionInput[],
  options?: QueryOptions,
): Promise<void> {
  if (inputs.length === 0) return
  const insert = createModeratorActionInsert('recordModeratorActions')
  insert.append(sql`
    SELECT
      ${actorId}::uuid,
      input.action_type,
      input.community_id,
      input.post_id,
      input.target_user_id,
      input.report_id,
      input.review_dispute_id,
      input.moderation_appeal_id,
      input.community_application_id,
      input.reason,
      input.metadata
    FROM UNNEST(
      ${inputs.map(input => input.actionType)}::moderator_action_types[],
      ${inputs.map(input => input.communityId ?? null)}::uuid[],
      ${inputs.map(input => input.postId ?? null)}::uuid[],
      ${inputs.map(input => input.targetUserId ?? null)}::uuid[],
      ${inputs.map(input => input.reportId ?? null)}::uuid[],
      ${inputs.map(input => input.reviewDisputeId ?? null)}::uuid[],
      ${inputs.map(input => input.moderationAppealId ?? null)}::uuid[],
      ${inputs.map(input => input.communityApplicationId ?? null)}::uuid[],
      ${inputs.map(input => input.reason ?? null)}::text[],
      ${inputs.map(input => JSON.stringify(input.metadata ?? {}))}::jsonb[]
    ) AS input(
      action_type,
      community_id,
      post_id,
      target_user_id,
      report_id,
      review_dispute_id,
      moderation_appeal_id,
      community_application_id,
      reason,
      metadata
    )`)
  await write(insert, options)
}

function createModeratorActionInsert(
  queryName: 'recordModeratorAction' | 'recordModeratorActions',
) {
  const insert =
    queryName === 'recordModeratorAction'
      ? sql`/* recordModeratorAction */ INSERT INTO moderator_actions `
      : sql`/* recordModeratorActions */ INSERT INTO moderator_actions `
  insert.append(MODERATOR_ACTION_INSERT_COLUMNS)
  return insert
}
