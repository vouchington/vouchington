import type { ReviewDisputeResponse } from './types.mts'

export type RedactedReviewDispute = Omit<
  ReviewDisputeResponse,
  | 'disputant_user_id'
  | 'claim_text'
  | 'recommended_action'
  | 'ai_public_response'
  | 'ai_internal_response'
  | 'model'
  | 'ai_drafted_at'
  | 'internal_notes'
  | 'drafted_at'
  | 'edited_at'
  | 'edited_by_id'
  | 'approved_by_id'
  | 'resolved_by_id'
  | 'latest_lifecycle_change_id'
  | 'staff_context'
> & {
  public_response: string | null
}

/**
 * Strips private fields for public (non-staff) consumers.
 * public_response is only exposed after sent_at is set.
 */
export function redactReviewDispute(dispute: ReviewDisputeResponse): RedactedReviewDispute {
  const {
    disputant_user_id: _d,
    claim_text: _ct,
    recommended_action: _ra,
    ai_public_response: _apr,
    ai_internal_response: _air,
    model: _m,
    ai_drafted_at: _ada,
    internal_notes: _in,
    drafted_at: _da,
    edited_at: _ea,
    edited_by_id: _ebi,
    approved_by_id: _abi,
    resolved_by_id: _rbi,
    latest_lifecycle_change_id: _llci,
    staff_context: _sc,
    public_response,
    ...rest
  } = dispute
  return {
    ...rest,
    public_response: dispute.sent_at ? public_response : null,
  }
}

export function listRedactedReviewDisputes(
  disputes: ReviewDisputeResponse[],
): RedactedReviewDispute[] {
  return disputes.map(redactReviewDispute)
}
