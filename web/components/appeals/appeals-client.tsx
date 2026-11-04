'use client'
import { useReducer } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { listModerationAppealsClient } from '@/lib/api/client/appeals'
import { AppealsTable } from './appeals-table'
import { AppealDetailDialog } from './appeal-detail-dialog'
import {
  appealsClientReducer,
  initialAppealsClientState,
  withAppealOverrides,
} from './appeals-client-state'
import { useAppealActions } from './use-appeal-actions'
import type { ModerationAppealSummary, ModerationAppealViewerRole } from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'
interface AppealsData {
  appeals: ModerationAppealSummary[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}
interface AppealsClientProps {
  viewerTier: 'staff' | 'member'
  viewerRole?: ModerationAppealViewerRole
  data: AppealsData
  statusFilter?: string
  mine?: boolean
}
const uniqueAppeals = (appeals: ModerationAppealSummary[]): ModerationAppealSummary[] => [
  ...new Map(appeals.map(appeal => [appeal.id, appeal])).values(),
]

export function AppealsClient({
  viewerTier,
  viewerRole = 'member',
  data,
  statusFilter,
  mine = false,
}: AppealsClientProps) {
  const t = useTranslations()
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(
      data,
      '/api/v1/appeals',
      { status: statusFilter, mine },
      {
        loadPage: after =>
          listModerationAppealsClient({ after, status: statusFilter, mine: mine || undefined }),
      },
    )
  const [state, dispatch] = useReducer(appealsClientReducer, initialAppealsClientState)
  const actions = useAppealActions(state, dispatch)
  const appeals = withAppealOverrides(
    uniqueAppeals(pages.flatMap(page => page.appeals)),
    state.appealOverrides,
  )
  const open = state.openId ? state.appealOverrides[state.openId] : undefined

  return (
    <div
      className='space-y-4'
      data-pw='appeals-list'
    >
      <p className='text-sm text-muted-foreground'>
        {t('shared.countLabel.format', { count: appeals.length, unit: 'appeal' })}
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
        <AppealsTable
          viewerTier={viewerTier}
          appeals={appeals}
          loadingIds={actions.loadingIds}
          onOpen={actions.handleOpen}
        />
      </InfiniteScroll>
      {viewerTier === 'staff' ? (
        <AppealDetailDialog
          appeal={
            open
              ? { ...open, public_response: state.draftEdits[open.id] ?? open.public_response }
              : null
          }
          onClose={() => dispatch({ type: 'close_appeal' })}
          viewerRole={viewerRole}
          disabled={Boolean(open && actions.loadingIds.has(open.id))}
          onEdit={(id, text) => dispatch({ type: 'edit_draft', id, text })}
          onApprove={actions.handleSaveAndApprove}
          onSend={actions.handleSend}
          onRerunAI={actions.handleRerunAI}
          onResolve={actions.handleResolve}
        />
      ) : null}
    </div>
  )
}
