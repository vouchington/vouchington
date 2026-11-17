import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  getModerationAppealByIdFromPrimary,
  createModerationAppealDraft,
  getAppealResolutionRunStatus,
  claimAppealResolutionRun,
  markAppealResolutionRunExpired,
} from '@services/moderation-appeals'
import { getUserWarningById } from '@services/user-warnings'
import { getCommunityBanById } from '@services/communities/bans/get'
import { getUserSuspensionById } from '@services/users/suspension'
import { fetchEntityContent } from '@services/moderation'
import { callAppealModel, type AppealModelCaller } from './model.mts'

export type { AppealModelCaller } from './model.mts'

export interface AppealModelInput {
  appealId: string
  /** The admitted resolution run; its row id is the request identity. */
  runId: string
  rerunById?: string | null
}

/**
 * Runs the AI appeal-resolution agent for a single moderation appeal.
 * Updates the appeal with ai_public_response, ai_internal_response, recommended_action.
 * The caller passes the `{ provider, model }` its service setting holds; `callModel` defaults to
 * the real provider call and is injected in tests.
 */
export async function runAppealResolutionAgent(
  input: AppealModelInput,
  selection: ModelSelection,
  callModel: AppealModelCaller = callAppealModel,
): Promise<void> {
  const { appealId, runId, rerunById } = input

  const runStatus = await getAppealResolutionRunStatus(appealId, runId)
  // A missing outcome is inconclusive, and terminal work must never make another paid call.
  if (runStatus !== 'active') return
  if (!(await claimAppealResolutionRun(appealId, runId))) {
    await markAppealResolutionRunExpired(appealId, runId)
    return
  }

  // The claim proved the appeal open and this run current; a deleted appeal cascades its runs.
  // A later approval or newer run is caught atomically by the draft save, which expires this run.
  const appeal = await getModerationAppealByIdFromPrimary(appealId)
  if (!appeal) return

  // Manual reruns bypass only existing-draft idempotency.
  if (!rerunById && appeal.ai_drafted_at != null) return

  // Build context about the original action using service layer (no direct DB access)
  let actionContext = ''
  if (appeal.user_warning_id) {
    const warning = await getUserWarningById(appeal.user_warning_id)
    if (warning) {
      actionContext = `Original action: Warning\nReason: ${warning.reason}${warning.public_message ? `\nPublic message: ${warning.public_message}` : ''}`
    }
  } else if (appeal.community_ban_id) {
    const ban = await getCommunityBanById(appeal.community_ban_id)
    if (ban) {
      actionContext = `Original action: Community ban\nReason: ${ban.reason ?? 'None provided'}${ban.expires_at ? `\nExpires: ${ban.expires_at.toISOString()}` : '\nPermanent ban'}`
    }
  } else if (appeal.user_suspension_id) {
    const suspension = await getUserSuspensionById(appeal.user_suspension_id)
    if (suspension) {
      actionContext = `Original action: Platform suspension\nReason: ${suspension.reason ?? 'None provided'}`
    }
  } else if (appeal.post_id) {
    const entityContent = await fetchEntityContent('post', appeal.post_id)
    const postRemovalAction = getPostRemovalActionLabel(appeal.post_removal_kind)
    if (entityContent) {
      const sanitizedContent = await sanitizePromptInjection(entityContent.text)
      const wrappedContent = wrapExternalContent(sanitizedContent, {
        source: 'user_content',
        contentType: 'post',
      })
      actionContext = `Original action: ${postRemovalAction}\nPost content:\n${wrappedContent}`
    } else {
      actionContext = `Original action: ${postRemovalAction} (post content no longer available)`
    }
  }

  const sanitizedReason = await sanitizePromptInjection(appeal.appeal_reason)
  const wrappedReason = wrapExternalContent(sanitizedReason, {
    source: 'user_report',
    contentType: 'appeal_reason',
  })

  const userInput = [
    `## Original Action`,
    actionContext || '(Action details not available)',
    `\n## Appeal Reason`,
    wrappedReason,
  ].join('\n')

  const safetyIdentifier = appeal.appellant_user_id
  // Usage is recorded from what was actually spent: on success, and for a billed answer that
  // failed validation or did not complete, which still billed tokens.
  const result = await callAgentModel({
    agentSlug: 'appeal-resolution',
    selection,
    input: userInput,
    safetyIdentifier,
    callModel,
    communityId: appeal.community_id,
    postId: appeal.post_id,
  })

  const savedDraft = await createModerationAppealDraft({
    appealId,
    runId,
    recommendedAction: result.output.recommended_action,
    aiPublicResponse: result.output.public_response,
    aiInternalResponse: result.output.internal_response,
    model: result.model,
  })
  if (!savedDraft) await markAppealResolutionRunExpired(appealId, runId)
}

function getPostRemovalActionLabel(kind: 'platform' | 'community' | null): string {
  if (kind === 'community') return 'Community post removal'
  if (kind === 'platform') return 'Platform post removal'
  return 'Post removal'
}
