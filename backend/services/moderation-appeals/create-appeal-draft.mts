import { read, withPrimaryReads } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  saveRunGatedAiDraft,
  type RunGatedDraftSpec,
} from '@services/moderator-actions/ai-draft-save'
import type { ModerationAppeal, ModerationAppealAction } from './config.mts'

export interface AiDraftInput {
  appealId: string
  /** The admitted resolution run; only the appeal's current requested run may save a draft. */
  runId: string
  recommendedAction: ModerationAppealAction
  aiPublicResponse: string
  aiInternalResponse: string
  model: string
}

const APPEAL_DRAFT_SPEC: RunGatedDraftSpec = {
  name: 'createModerationAppealDraft',
  table: 'moderation_appeals',
  lifecycleTable: 'moderation_appeal_lifecycle_changes',
  runsTable: 'moderation_appeal_resolution_runs',
  parentColumn: 'moderation_appeal_id',
  requestedRunColumn: 'ai_draft_requested_run_id',
  requireActiveRun: false,
  clearApproval: true,
  returning: `id, appellant_user_id, user_warning_id, community_ban_id, post_id, community_id, post_removal_kind,
appeal_reason,
CASE
  WHEN resolved_at IS NULL THEN 'pending'
  WHEN resolution_action = 'deny' THEN 'dismissed'
  ELSE 'resolved'
END AS status,
recommended_action, ai_public_response, ai_internal_response,
model, ai_drafted_at, ai_draft_run_id,
ai_draft_requested_run_id,
public_response, internal_notes, drafted_at, edited_at, edited_by_id,
approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
resolution_action, latest_lifecycle_change_id, updated_at`,
  notFoundMessage: 'Appeal not found',
}

export function createModerationAppealDraft(input: AiDraftInput): Promise<ModerationAppeal | null> {
  return saveRunGatedAiDraft<ModerationAppeal>(APPEAL_DRAFT_SPEC, {
    ...input,
    parentId: input.appealId,
  })
}

/** Checks the committed request without fencing unrelated appeal readers or writers. */
export async function isCurrentModerationAppealDraftRequest(
  appealId: string,
  runId: string,
): Promise<boolean> {
  return withPrimaryReads(async () => {
    const { rows } = await read<{
      ai_draft_requested_run_id: string | null
      approved_at: Date | null
      sent_at: Date | null
      resolved_at: Date | null
    }>(sql`
      /* isCurrentModerationAppealDraftRequest */
      SELECT ai_draft_requested_run_id, approved_at, sent_at, resolved_at
      FROM moderation_appeals
      WHERE id = ${appealId}
    `)
    const appeal = rows[0]
    return (
      appeal?.ai_draft_requested_run_id === runId &&
      appeal.approved_at === null &&
      appeal.sent_at === null &&
      appeal.resolved_at === null
    )
  })
}
