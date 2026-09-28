import type { StatusFilter } from '@/types/report-integrity'
import type { ReportIntegrityFlagsState } from './use-report-integrity-flags'

export type ReportIntegrityFlagsTableProps = Pick<
  ReportIntegrityFlagsState,
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
  | 'penaltyConfirm'
  | 'penaltyResults'
  | 'resetKey'
  | 'resolutions'
  | 'reconciliationRequired'
  | 'retryReconciliation'
  | 'updateResolution'
> & {
  initialStatus: StatusFilter
}
