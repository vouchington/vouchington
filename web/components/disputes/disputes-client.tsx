'use client'

import { useReducer } from 'react'
import onError from '@/lib/on-error/on-error'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  approveDispute,
  dismissDispute,
  resolveDisputeRemove,
  resolveDisputeAnnotate,
  sendDisputeResolution,
  updateDisputeDraft,
  rerunDisputeAI,
  listReviewDisputesClient,
} from '@/lib/api/client/disputes'
import { DisputesTable } from './disputes-table'
import type { ReviewDispute } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'
import { disputesClientReducer, uniqueDisputes } from './disputes-client-state'

interface DisputesData {
  disputes: ReviewDispute[]
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
  const t = useTranslations()
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
  const [state, dispatch] = useReducer(disputesClientReducer, {
    disputeOverrides: {},
    loadingId: null,
    draftEdits: {},
  })
  const disputes = uniqueDisputes(pages.flatMap(page => page.disputes)).map(
    dispute => state.disputeOverrides[dispute.id] ?? dispute,
  )

  async function handleApprove(id: string) {
    dispatch({ type: 'set_loading', id })
    try {
      const result = await approveDispute(id)
      dispatch({ type: 'update_dispute', dispute: result.dispute })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.disputes.disputesClient.failedToApproveDispute_c4b95406'),
        tags: { form: 'dispute-approve' },
      })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

  async function handleSend(id: string) {
    dispatch({ type: 'set_loading', id })
    try {
      const result = await sendDisputeResolution(id)
      dispatch({ type: 'update_dispute', dispute: result.dispute })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.disputes.disputesClient.failedToSendDisputeResolution_7cdfc475'),
        tags: { form: 'dispute-send' },
      })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

  async function handleRerunAI(id: string) {
    dispatch({ type: 'set_loading', id })
    try {
      await rerunDisputeAI(id)
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a rerun AI failure */
      onError(error, {
        fallback: t('extracted.disputes.disputesClient.failedToReRunAi_8c594308'),
        tags: { form: 'dispute-rerun' },
      })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

  async function handleResolve(id: string, action: 'remove' | 'dismiss') {
    dispatch({ type: 'set_loading', id })
    try {
      const result =
        action === 'dismiss' ? await dismissDispute(id) : await resolveDisputeRemove(id, action)
      dispatch({ type: 'update_dispute', dispute: result.dispute })
    } catch (error) {
      /* c8 ignore next -- error path requires injecting a resolve dispute failure */
      onError(error, {
        fallback: t('extracted.disputes.disputesClient.failedToResolveDispute_ed6dde5c'),
        tags: { form: 'dispute-resolve' },
      })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

  async function handleSaveAndApprove(id: string) {
    const text = state.draftEdits[id]
    if (text !== undefined) {
      try {
        await updateDisputeDraft(id, { public_response: text })
      } catch (error) {
        // Do not approve a stale draft if saving the edits failed.
        /* c8 ignore next -- error path requires injecting a save draft failure */
        onError(error, {
          fallback: t('extracted.disputes.disputesClient.failedToSaveDraft_350705d0'),
        })
        return
      }
    }
    await handleApprove(id)
  }

  async function handleAnnotate(id: string, text: string) {
    dispatch({ type: 'set_loading', id })
    try {
      const result = await resolveDisputeAnnotate(id, text)
      dispatch({ type: 'update_dispute', dispute: result.dispute })
    } catch (error) {
      /* c8 ignore next 4 -- error path requires injecting an annotate failure */
      onError(error, {
        fallback: t('extracted.disputes.disputesClient.failedToAttachAnnotation_4e848bc5'),
        tags: { form: 'dispute-annotate' },
      })
    } finally {
      dispatch({ type: 'set_loading', id: null })
    }
  }

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
          draftEdits={state.draftEdits}
          loadingId={state.loadingId}
          onEdit={(id, text) => dispatch({ type: 'edit_draft', id, text })}
          onApprove={handleSaveAndApprove}
          onSend={handleSend}
          onRerunAI={handleRerunAI}
          onResolve={handleResolve}
          onAnnotate={handleAnnotate}
        />
      </InfiniteScroll>
    </div>
  )
}
