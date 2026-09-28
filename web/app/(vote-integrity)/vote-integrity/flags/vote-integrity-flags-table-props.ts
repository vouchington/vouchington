import type { StatusFilter } from '@/types/vote-integrity'
import type { VoteIntegrityFlagsState } from './use-vote-integrity-flags'

export type VoteIntegrityFlagsTableProps = Pick<
  VoteIntegrityFlagsState,
  | 'actionLoading'
  | 'actionErrors'
  | 'applyPenaltyWithConfirmation'
  | 'endCursor'
  | 'clearError'
  | 'fetchError'
  | 'flags'
  | 'handleLoadMore'
  | 'handleResolve'
  | 'hasNextPage'
  | 'isPending'
  | 'loadingMore'
  | 'penaltyApplied'
  | 'resetKey'
  | 'penaltyConfirm'
  | 'penaltyResults'
  | 'resolutions'
  | 'reconciliationRequired'
  | 'retryReconciliation'
  | 'updateResolution'
> & {
  initialStatus: StatusFilter
}
