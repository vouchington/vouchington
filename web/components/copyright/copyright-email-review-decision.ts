import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'

// What every staff decision on an email intake records: the rationale, and the agent
// recommendation it rested on or the reason staff went without one.
export function copyrightEmailDecisionBasis(
  detail: CopyrightEmailIntake,
  rationale: string,
  manualFallbackReason: string,
) {
  return {
    rationale: rationale.trim(),
    recommendation_id: detail.recommendation?.id ?? null,
    manual_fallback_reason: detail.recommendation ? null : manualFallbackReason.trim(),
  }
}

// The reply address field only exists for an intake with no parsed sender, and the server
// refuses an address beside one. Rejecting and asking for information share this rule.
export function copyrightEmailReplyAddress(detail: CopyrightEmailIntake, replyEmail: string) {
  return detail.parsed_email ? null : replyEmail.trim() || null
}

export function copyrightEmailReplyOutcome(response: { reply_queued: boolean }) {
  return response.reply_queued ? 'A reply was queued.' : 'No reply sent.'
}

export function copyrightEmailActionError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
