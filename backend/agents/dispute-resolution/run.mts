import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { moderationAiConfig } from '@services/moderation'
import { getReviewDisputeById, createReviewDisputeDraft } from '@services/review-disputes'
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
 * The caller passes the `{ provider, model }` its service setting holds; `callModel` defaults to
 * the real provider call and is injected in tests.
 */
export async function runDisputeResolutionAgent(
  input: DisputeModelInput,
  selection: ModelSelection,
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
  // Usage is recorded from what was actually spent: on success, and for a billed answer that
  // failed validation or did not complete, which still billed tokens.
  const result = await callAgentModel({
    agentSlug: 'dispute-resolution',
    selection,
    input: userInput,
    safetyIdentifier,
    callModel,
    communityId: entityContent.communityId,
    postId: dispute.post_id,
  })

  await createReviewDisputeDraft({
    disputeId,
    recommendedAction: result.output.recommended_action,
    aiPublicResponse: result.output.public_response,
    aiInternalResponse: result.output.internal_response,
    model: result.model,
  })
}
