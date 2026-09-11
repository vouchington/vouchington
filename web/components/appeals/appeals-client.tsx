'use client'
import { useReducer, useRef } from 'react'
import onError from '@/lib/on-error/on-error'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import {
  approveAppeal,
  sendAppealResolution,
  updateAppealDraft,
  resolveAppeal,
  enqueueAppealAIDraftRerun,
  reconcileAppealAIDraft,
  AppealDraftReconciliationTimeoutError,
  listModerationAppealsClient,
} from '@/lib/api/client/appeals'
import { AppealsTable } from './appeals-table'
import { appealsClientReducer, initialAppealsClientState } from './appeals-client-state'
import type {
  ModerationAppeal,
  ModerationAppealAction,
  ModerationAppealViewerRole,
} from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'
interface AppealsData {
  appeals: ModerationAppeal[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}
interface AppealsClientProps {
  viewerTier: 'staff' | 'member'
  viewerRole?: ModerationAppealViewerRole
  data: AppealsData
  statusFilter?: string
  mine?: boolean
}
const uniqueAppeals = (appeals: ModerationAppeal[]): ModerationAppeal[] => [
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
  const { loadingIds, runWithLoadingId } = useLoadingIds()
  const rerunEnqueuesRef = useRef(new Map<string, Promise<void>>())
  const appeals = uniqueAppeals(pages.flatMap(page => page.appeals)).map(
    appeal => state.appealOverrides[appeal.id] ?? appeal,
  )

  async function handleApprove(id: string) {
    await runWithLoadingId(id, async () => {
      try {
        const result = await approveAppeal(id)
        dispatch({ type: 'update_appeal', appeal: result.appeal })
      } catch (error) {
        onError(error, {
          fallback: t('extracted.appeals.appealsClient.failedToApproveAppeal_b5452349'),
          tags: { form: 'appeal-approve' },
        })
      }
    })
  }

  async function handleSend(id: string) {
    await runWithLoadingId(id, async () => {
      try {
        const result = await sendAppealResolution(id)
        dispatch({ type: 'update_appeal', appeal: result.appeal })
      } catch (error) {
        onError(error, {
          fallback: t('extracted.appeals.appealsClient.failedToSendAppealResolution_87938c2e'),
          tags: { form: 'appeal-send' },
        })
      }
    })
  }

  async function handleRerunAI(id: string) {
    await runWithLoadingId(id, async () => {
      try {
        const appeal = appeals.find(candidate => candidate.id === id)
        if (!appeal) throw new Error(`Could not find appeal ${id}`)
        let enqueue = rerunEnqueuesRef.current.get(id)
        if (!enqueue) {
          enqueue = enqueueAppealAIDraftRerun(id)
          rerunEnqueuesRef.current.set(id, enqueue)
        }
        try {
          await enqueue
        } catch (error) {
          rerunEnqueuesRef.current.delete(id)
          throw error
        }
        let result: Awaited<ReturnType<typeof reconcileAppealAIDraft>>
        try {
          result = await reconcileAppealAIDraft(appeal)
        } catch (error) {
          if (error instanceof AppealDraftReconciliationTimeoutError) {
            rerunEnqueuesRef.current.delete(id)
          }
          throw error
        }
        rerunEnqueuesRef.current.delete(id)
        dispatch({ type: 'reconcile_rerun_appeal', appeal: result.appeal })
      } catch (error) {
        onError(error, {
          fallback: t('extracted.appeals.appealsClient.failedToReRunAi_8c594308'),
          tags: { form: 'appeal-rerun' },
        })
      }
    })
  }

  async function handleResolve(id: string, action: ModerationAppealAction) {
    await runWithLoadingId(id, async () => {
      try {
        const result = await resolveAppeal(id, action)
        dispatch({ type: 'update_appeal', appeal: result.appeal })
      } catch (error) {
        onError(error, {
          fallback: t('extracted.appeals.appealsClient.failedToResolveAppeal_162e0dc1'),
          tags: { form: 'appeal-resolve' },
        })
      }
    })
  }

  async function handleSaveAndApprove(id: string) {
    const text = state.draftEdits[id]
    if (text !== undefined) {
      try {
        await updateAppealDraft(id, { public_response: text })
      } catch (error) {
        onError(error, {
          fallback: t('extracted.appeals.appealsClient.failedToSaveDraft_350705d0'),
        })
        return
      }
    }
    await handleApprove(id)
  }

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
          viewerRole={viewerRole}
          appeals={appeals}
          draftEdits={state.draftEdits}
          loadingIds={loadingIds}
          onEdit={(id, text) => dispatch({ type: 'edit_draft', id, text })}
          onApprove={handleSaveAndApprove}
          onSend={handleSend}
          onRerunAI={handleRerunAI}
          onResolve={handleResolve}
        />
      </InfiniteScroll>
    </div>
  )
}
