import {
  toReviewDisputeSummary,
  type ReviewDispute,
  type ReviewDisputeSummary,
} from '@/types/review-disputes'

export interface DisputesClientState {
  /** Full disputes read when a row was opened, or returned by a staff action on it. */
  disputeOverrides: Record<string, ReviewDispute>
  loadingId: string | null
  draftEdits: Record<string, string>
  openId: string | null
}

export type DisputesClientAction =
  | { type: 'set_loading'; id: string | null }
  | { type: 'update_dispute'; dispute: ReviewDispute }
  | { type: 'open_dispute'; dispute: ReviewDispute }
  | { type: 'close_dispute' }
  | { type: 'edit_draft'; id: string; text: string }

export const initialDisputesClientState: DisputesClientState = {
  disputeOverrides: {},
  loadingId: null,
  draftEdits: {},
  openId: null,
}

export function disputesClientReducer(
  state: DisputesClientState,
  action: DisputesClientAction,
): DisputesClientState {
  switch (action.type) {
    case 'set_loading': {
      return { ...state, loadingId: action.id }
    }
    case 'update_dispute': {
      return {
        ...state,
        disputeOverrides: { ...state.disputeOverrides, [action.dispute.id]: action.dispute },
      }
    }
    case 'open_dispute': {
      return {
        ...state,
        openId: action.dispute.id,
        disputeOverrides: { ...state.disputeOverrides, [action.dispute.id]: action.dispute },
      }
    }
    case 'close_dispute': {
      return { ...state, openId: null }
    }
    case 'edit_draft': {
      return { ...state, draftEdits: { ...state.draftEdits, [action.id]: action.text } }
    }
  }
  throw new Error('Unexpected value in disputesClientReducer')
}

export function uniqueDisputes(disputes: ReviewDisputeSummary[]): ReviewDisputeSummary[] {
  return [...new Map(disputes.map(dispute => [dispute.id, dispute])).values()]
}

/** A row stands for the full dispute once staff opened or changed it. */
export function withDisputeOverrides(
  disputes: ReviewDisputeSummary[],
  overrides: Record<string, ReviewDispute>,
): ReviewDisputeSummary[] {
  return disputes.map(dispute => {
    const override = overrides[dispute.id]
    return override ? toReviewDisputeSummary(override) : dispute
  })
}
