'use client'

import { useReducer } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { listReviewDisputesClient } from '@/lib/api/client/disputes'
import { DisputesTable } from './disputes-table'
import { DisputeDetailDialog } from './dispute-detail-dialog'
import type { ReviewDisputeSummary } from '@/types/review-disputes'
import {
  disputesClientReducer,
  initialDisputesClientState,
  uniqueDisputes,
  withDisputeOverrides,
} from './disputes-client-state'
import { useDisputeActions } from './use-dispute-actions'
import { useDisputeAiReruns } from './use-dispute-ai-reruns'

interface DisputesData {
  disputes: ReviewDisputeSummary[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

interface DisputesClientProps {
  viewerTier: 'staff' | 'member'
  data: DisputesData
  statusFilter?: string
  mine?: boolean
}

export function DisputesClient({
  viewerTier,
  data,
  statusFilter,
  mine = false,
}: DisputesClientProps) {
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(
      data,
      '/api/v1/disputes',
      { status: statusFilter, mine },
      {
        loadPage: after =>
          listReviewDisputesClient({ after, status: statusFilter, mine: mine || undefined }),
      },
    )
  const [state, dispatch] = useReducer(disputesClientReducer, initialDisputesClientState)
  const disputes = withDisputeOverrides(
    uniqueDisputes(pages.flatMap(page => page.disputes)),
    state.disputeOverrides,
  )
  const open = state.openId ? state.disputeOverrides[state.openId] : undefined
  const { handleRerunAI, pendingRerunIds } = useDisputeAiReruns(state.disputeOverrides, dispatch)
  const actions = useDisputeActions(state, dispatch)

  return (
    <div
      className='space-y-4'
      data-pw='disputes-list'
    >
      <p className='text-sm text-muted-foreground'>
        {disputes.length} dispute{disputes.length === 1 ? '' : 's'}
      </p>
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        <DisputesTable
          viewerTier={viewerTier}
          disputes={disputes}
          loadingId={state.loadingId}
          pendingRerunIds={pendingRerunIds}
          onOpen={actions.handleOpen}
        />
      </InfiniteScroll>
      {viewerTier === 'staff' ? (
        <DisputeDetailDialog
          dispute={
            open
              ? { ...open, public_response: state.draftEdits[open.id] ?? open.public_response }
              : null
          }
          onClose={() => dispatch({ type: 'close_dispute' })}
          disabled={state.loadingId !== null || Boolean(open && pendingRerunIds.has(open.id))}
          onEdit={(id, text) => dispatch({ type: 'edit_draft', id, text })}
          onApprove={actions.handleSaveAndApprove}
          onSend={actions.handleSend}
          onRerunAI={handleRerunAI}
          onResolve={actions.handleResolve}
          onAnnotate={actions.handleAnnotate}
        />
      ) : null}
    </div>
  )
}
