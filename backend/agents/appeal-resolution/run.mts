import {
  parseLLMJsonResponse,
  DEFAULT_AGENT_MODEL,
  callRecordingAgentResponseUsage,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  getModerationAppealByIdFromPrimary,
  createModerationAppealDraft,
  type ModerationAppealAction,
} from '@services/moderation-appeals'
import { getUserWarningById } from '@services/user-warnings'
import { getCommunityBanById } from '@services/communities/bans/get'
import { getUserSuspensionById } from '@services/users/suspension'
import { fetchEntityContent } from '@services/moderation'
import onError from '@modules/on-error'
import { callAppealModel, type AppealModelCaller } from './model.mts'

export type { AppealModelCaller } from './model.mts'

export interface AppealModelInput {
  appealId: string
  rerunById?: string | null
}

/**
 * Runs the AI appeal-resolution agent for a single moderation appeal.
 * Updates the appeal with ai_public_response, ai_internal_response, recommended_action.
 * `callModel` defaults to the real OpenAI call and is injected in tests.
 */
export async function runAppealResolutionAgent(
  input: AppealModelInput,
  callModel: AppealModelCaller = callAppealModel,
): Promise<void> {
  const { appealId, rerunById } = input

  const appeal = await getModerationAppealByIdFromPrimary(appealId)
  if (!appeal) {
    onError(new Error(`runAppealResolutionAgent: appeal not found: ${appealId}`))
    return
  }

  if (appeal.approved_at != null || appeal.sent_at != null || appeal.resolved_at != null) return

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

  const safetyIdentifier = appeal.appellant_id
  // Record from what was actually spent (both on success and on a failed/incomplete response,
  // which still billed tokens), independent of whether the response below parses — a malformed
  // response still billed real tokens, and extractTextFromOpenAIResponse throws on a
  // completed-but-unextractable response (e.g. a refusal item), which must not skip recording.
  const response = await callRecordingAgentResponseUsage(
    () => callModel(userInput, safetyIdentifier),
    {
      agentSlug: 'appeal-resolution',
      communityId: appeal.community_id,
      postId: appeal.post_id,
    },
  )

  const text = extractTextFromOpenAIResponse(response)

  const parsed = parseLLMJsonResponse<{
    recommended_action: string
    public_response: string
    internal_response: string
  }>(text)

  const validActions = new Set<string>(['accept', 'deny', 'reduce'])
  if (
    !parsed ||
    !validActions.has(parsed.recommended_action) ||
    typeof parsed.public_response !== 'string' ||
    typeof parsed.internal_response !== 'string'
  ) {
    throw new TypeError(`runAppealResolutionAgent: invalid response shape: ${text}`)
  }

  await createModerationAppealDraft({
    appealId,
    recommendedAction: parsed.recommended_action as ModerationAppealAction,
    aiPublicResponse: parsed.public_response,
    aiInternalResponse: parsed.internal_response,
    model: DEFAULT_AGENT_MODEL,
  })
}

function getPostRemovalActionLabel(kind: 'platform' | 'community' | null): string {
  if (kind === 'community') return 'Community post removal'
  if (kind === 'platform') return 'Platform post removal'
  return 'Post removal'
}
