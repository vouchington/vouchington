import type { ReviewDispute } from '@/types/review-disputes'

export interface DisputesClientState {
  disputeOverrides: Record<string, ReviewDispute>
  loadingId: string | null
  draftEdits: Record<string, string>
}

export type DisputesClientAction =
  | { type: 'set_loading'; id: string | null }
  | { type: 'update_dispute'; dispute: ReviewDispute }
  | { type: 'edit_draft'; id: string; text: string }

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
    case 'edit_draft': {
      return { ...state, draftEdits: { ...state.draftEdits, [action.id]: action.text } }
    }
  }
}

export function uniqueDisputes(disputes: ReviewDispute[]): ReviewDispute[] {
  return [...new Map(disputes.map(dispute => [dispute.id, dispute])).values()]
}
