import {
  parseLLMJsonResponse,
  DEFAULT_AGENT_MODEL,
  callRecordingAgentResponseUsage,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { moderationAiConfig } from '@services/moderation'
import {
  getReviewDisputeById,
  createReviewDisputeDraft,
  type ReviewDisputeRecommendedAction,
} from '@services/review-disputes'
import onError from '@modules/on-error'
import { callDisputeModel, type DisputeModelCaller } from './model.mts'

export type { DisputeModelCaller } from './model.mts'

export interface DisputeModelInput {
  disputeId: string
  rerunById?: string | null
}

/**
 * Runs the AI dispute-resolution agent for a single review dispute.
 * Updates the dispute with ai_public_response, ai_internal_response, recommended_action.
 * `callModel` defaults to the real OpenAI call and is injected in tests.
 */
export async function runDisputeResolutionAgent(
  input: DisputeModelInput,
  callModel: DisputeModelCaller = callDisputeModel,
): Promise<void> {
  const { disputeId, rerunById } = input

  const dispute = await getReviewDisputeById(disputeId)
  if (!dispute) {
    onError(new Error(`runDisputeResolutionAgent: dispute not found: ${disputeId}`))
    return
  }

  if (dispute.approved_at != null || dispute.sent_at != null || dispute.resolved_at != null) {
    return
  }

  // Manual reruns bypass only existing-draft idempotency.
  if (!rerunById && dispute.ai_drafted_at != null) return

  // Community feature gate
  if (!moderationAiConfig.getFields().community_judgement_enabled) {
    // Disputes are not community-scoped but respect the gate as a general AI-enabled flag
    // Only skip if the config explicitly disables all AI judgement
  }

  // Fetch the review post content
  const { fetchEntityContent } = await import('@services/moderation')
  const entityContent = await fetchEntityContent('post', dispute.post_id)
  if (!entityContent) {
    onError(
      new Error(`runDisputeResolutionAgent: review post not found or deleted: ${dispute.post_id}`),
    )
    return
  }

  const sanitizedReview = await sanitizePromptInjection(entityContent.text)
  const wrappedReview = wrapExternalContent(sanitizedReview, {
    source: 'user_content',
    contentType: 'review',
  })

  const sanitizedClaim = await sanitizePromptInjection(dispute.claim_text)
  const wrappedClaim = wrapExternalContent(sanitizedClaim, {
    source: 'user_report',
    contentType: 'dispute_claim',
  })

  const userInput = [
    `## Review Content (post_id: ${dispute.post_id})`,
    wrappedReview,
    `\n## Dispute Claim (reason: ${dispute.reason})`,
    wrappedClaim,
  ].join('\n')

  const safetyIdentifier = entityContent.authorId ?? dispute.post_id
  // Record from what was actually spent (both on success and on a failed/incomplete response,
  // which still billed tokens), independent of whether the response below parses — a malformed
  // response still billed real tokens, and extractTextFromOpenAIResponse throws on a
  // completed-but-unextractable response (e.g. a refusal item), which must not skip recording.
  const response = await callRecordingAgentResponseUsage(
    () => callModel(userInput, safetyIdentifier),
    {
      agentSlug: 'dispute-resolution',
      communityId: entityContent.communityId,
      postId: dispute.post_id,
    },
  )

  const text = extractTextFromOpenAIResponse(response)

  const parsed = parseLLMJsonResponse<{
    recommended_action: string
    public_response: string
    internal_response: string
  }>(text)

  const validActions = new Set<string>(['no_action', 'remove', 'annotate', 'dismiss'])
  if (
    !parsed ||
    !validActions.has(parsed.recommended_action) ||
    typeof parsed.public_response !== 'string' ||
    typeof parsed.internal_response !== 'string'
  ) {
    throw new TypeError(`runDisputeResolutionAgent: invalid response shape: ${text}`)
  }

  await createReviewDisputeDraft({
    disputeId,
    recommendedAction: parsed.recommended_action as ReviewDisputeRecommendedAction,
    aiPublicResponse: parsed.public_response,
    aiInternalResponse: parsed.internal_response,
    model: DEFAULT_AGENT_MODEL,
  })
}
