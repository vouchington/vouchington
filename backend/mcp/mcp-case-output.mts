import {
  MODERATION_APPEAL_ACTIONS,
  MODERATION_APPEAL_STATUSES,
  REVIEW_DISPUTE_ACTIONS,
  REVIEW_DISPUTE_REASONS,
  REVIEW_DISPUTE_STATUSES,
} from '@ts-shared/utils/moderation-catalogs'
import type { ReviewDisputeResponse } from '@services/review-disputes'
import type { ModerationAppealResponse } from '@services/moderation-appeals/types'
import { externalText, iso } from './mcp-read-output.mts'
import { nullable, objectSchema, type JsonSchema } from './output-schema-shapes.mts'

/**
 * What an MCP client sees of a dispute or an appeal it filed: the member view of the REST routes,
 * reduced to ids, codes and timestamps. The claim, the appeal reason, the staff and AI fields and
 * the display text of the disputed post or appealed decision never leave the server; the client
 * has them already, or reads the target itself. The moderators' public response is the one piece
 * of text, and it is written by someone else, so it is fenced as external content.
 */
export type McpDispute = {
  id: string
  post_id: string
  topic_id: string
  reason: ReviewDisputeResponse['reason']
  status: ReviewDisputeResponse['status']
  is_overdue?: boolean
  resolution_action: ReviewDisputeResponse['resolution_action']
  public_response: string | null
  resolved_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type McpAppeal = {
  id: string
  target_type: 'warning' | 'ban' | 'removal' | 'suspension'
  target_id: string
  community_id: string | null
  post_removal_kind: ModerationAppealResponse['post_removal_kind']
  status: ModerationAppealResponse['status']
  is_overdue?: boolean
  resolution_action: ModerationAppealResponse['resolution_action']
  public_response: string | null
  resolved_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

const uuid: JsonSchema = { type: 'string', format: 'uuid' }
const timestamp: JsonSchema = { type: 'string', format: 'date-time' }
const nullableTimestamp = nullable(timestamp)
const nullableText = nullable({ type: 'string' })

export const DISPUTE_SCHEMA = objectSchema(
  {
    id: uuid,
    post_id: uuid,
    topic_id: uuid,
    reason: { enum: [...REVIEW_DISPUTE_REASONS] },
    status: { enum: [...REVIEW_DISPUTE_STATUSES] },
    is_overdue: { type: 'boolean' },
    resolution_action: nullable({ enum: [...REVIEW_DISPUTE_ACTIONS] }),
    public_response: nullableText,
    resolved_at: nullableTimestamp,
    sent_at: nullableTimestamp,
    created_at: timestamp,
    updated_at: timestamp,
  },
  ['is_overdue'],
)

export const APPEAL_SCHEMA = objectSchema(
  {
    id: uuid,
    target_type: { enum: ['warning', 'ban', 'removal', 'suspension'] },
    target_id: uuid,
    community_id: nullable(uuid),
    post_removal_kind: nullable({ enum: ['platform', 'community'] }),
    status: { enum: [...MODERATION_APPEAL_STATUSES] },
    is_overdue: { type: 'boolean' },
    resolution_action: nullable({ enum: [...MODERATION_APPEAL_ACTIONS] }),
    public_response: nullableText,
    resolved_at: nullableTimestamp,
    sent_at: nullableTimestamp,
    created_at: timestamp,
    updated_at: timestamp,
  },
  ['is_overdue'],
)

const isoOrNull = (value: Date | string | null): string | null =>
  value === null ? null : iso(value)

/** The response the moderators sent, once they sent it; nothing before that, like the REST views. */
function sentResponse(
  text: string | null,
  sentAt: Date | null,
  source: string,
  contentType: string,
): Promise<string | null> {
  return sentAt ? externalText(text, source, contentType) : Promise.resolve(null)
}

export async function toMcpDispute(dispute: ReviewDisputeResponse): Promise<McpDispute> {
  return {
    id: dispute.id,
    post_id: dispute.post_id,
    topic_id: dispute.topic_id,
    reason: dispute.reason,
    status: dispute.status,
    ...(dispute.is_overdue === undefined ? {} : { is_overdue: dispute.is_overdue }),
    resolution_action: dispute.resolution_action,
    public_response: await sentResponse(
      dispute.public_response,
      dispute.sent_at,
      'review_dispute',
      'dispute_public_response',
    ),
    resolved_at: isoOrNull(dispute.resolved_at),
    sent_at: isoOrNull(dispute.sent_at),
    created_at: iso(dispute.created_at),
    updated_at: iso(dispute.updated_at),
  }
}

/** The kind and id of the decision an appeal contests; exactly one of the four ids is set. */
function appealTarget(
  appeal: ModerationAppealResponse,
): Pick<McpAppeal, 'target_type' | 'target_id'> {
  if (appeal.user_warning_id) return { target_type: 'warning', target_id: appeal.user_warning_id }
  if (appeal.community_ban_id) return { target_type: 'ban', target_id: appeal.community_ban_id }
  if (appeal.post_id) return { target_type: 'removal', target_id: appeal.post_id }
  return { target_type: 'suspension', target_id: appeal.user_suspension_id as string }
}

export async function toMcpAppeal(appeal: ModerationAppealResponse): Promise<McpAppeal> {
  return {
    id: appeal.id,
    ...appealTarget(appeal),
    community_id: appeal.community_id,
    post_removal_kind: appeal.post_removal_kind,
    status: appeal.status,
    ...(appeal.is_overdue === undefined ? {} : { is_overdue: appeal.is_overdue }),
    resolution_action: appeal.resolution_action,
    public_response: await sentResponse(
      appeal.public_response,
      appeal.sent_at,
      'moderation_appeal',
      'appeal_public_response',
    ),
    resolved_at: isoOrNull(appeal.resolved_at),
    sent_at: isoOrNull(appeal.sent_at),
    created_at: iso(appeal.created_at),
    updated_at: iso(appeal.updated_at),
  }
}
