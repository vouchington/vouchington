'use client'

import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type {
  CopyrightEmailIntakeQueueItem,
  CopyrightEmailIntakeQueuePage,
} from '@/types/copyright-notices'
import type { CopyrightEmailApprovalDraft } from './copyright-email-approval-model'
import {
  createCopyrightEmailCorrespondenceDraft,
  type CopyrightEmailCorrespondenceDraft,
} from './copyright-email-correspondence-model'
import { CopyrightEmailReviewDetail } from './copyright-email-review-detail'
import {
  listCopyrightEmailIntakes,
  type CopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import { useCopyrightEmailReviewActions } from './copyright-email-review-actions'

export function CopyrightEmailReview({ data }: { data: CopyrightEmailIntakeQueuePage }) {
  const {
    pages,
    hasNextPage,
    endCursor,
    loadMore,
    loadingMore,
    fetchError,
    clearError,
    resetToFirstPage,
    resetKey,
  } = usePaginatedList(
    data,
    '/api/v1/copyright-email-intakes/review-queue',
    {},
    { loadPage: after => listCopyrightEmailIntakes({ after }) },
  )
  const itemById = new Map<string, CopyrightEmailIntakeQueueItem>()
  for (const page of pages) {
    for (const item of page.copyright_email_intakes) itemById.set(item.id, item)
  }
  const items = [...itemById.values()]
  const [detail, setDetail] = useState<CopyrightEmailIntake | null>(null)
  const [rationale, setRationale] = useState('')
  const [draft, setDraft] = useState<CopyrightEmailApprovalDraft | null>(null)
  const [correspondenceDraft, setCorrespondenceDraft] = useState<CopyrightEmailCorrespondenceDraft>(
    createCopyrightEmailCorrespondenceDraft,
  )
  const [manualFallbackReason, setManualFallbackReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { admitCorrespondence, approve, reject, rejectCorrespondence, selectIntake } =
    useCopyrightEmailReviewActions({
      correspondenceDraft,
      detail,
      draft,
      manualFallbackReason,
      rationale,
      setCorrespondenceDraft,
      setDetail,
      setDraft,
      setError,
      resetQueue: page => resetToFirstPage?.(page),
      setLoading,
      setManualFallbackReason,
      setRationale,
      setSuccess,
    })
  return (
    <main className='mx-auto max-w-4xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Copyright email review</h1>
      <p className='text-muted-foreground'>
        Staff must verify each parsed email and approve or reject it before any case action.
      </p>
      {error && (
        <Alert variant='destructive'>
          <AlertTitle>Review action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      <div className='grid gap-4 md:grid-cols-2'>
        <div>
          <InfiniteScroll
            hasNextPage={hasNextPage}
            endCursor={endCursor}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
            fetchError={fetchError}
            clearError={clearError}
            resetKey={resetKey}
          >
            <ul className='space-y-1'>
              {items.map(item => (
                <li key={item.id}>
                  <Button
                    disabled={loading}
                    onClick={() => selectIntake(item.id)}
                    variant='link'
                  >
                    {item.review_path === 'matched_thread'
                      ? 'Matched correspondence'
                      : item.review_path === 'unresolved_thread'
                        ? 'Unresolved reply'
                        : 'Initial intake'}{' '}
                    {item.id}
                  </Button>
                </li>
              ))}
            </ul>
          </InfiniteScroll>
        </div>
        {detail && (
          <CopyrightEmailReviewDetail
            detail={detail}
            draft={draft}
            loading={loading}
            rationale={rationale}
            manualFallbackReason={manualFallbackReason}
            correspondenceDraft={correspondenceDraft}
            onChangeDraft={setDraft}
            onChangeRationale={setRationale}
            onChangeManualFallbackReason={setManualFallbackReason}
            onChangeCorrespondenceDraft={setCorrespondenceDraft}
            onApproveInitial={() => approve()}
            onRejectInitial={() => reject()}
            onAdmitCorrespondence={() => admitCorrespondence()}
            onRejectCorrespondence={() => rejectCorrespondence()}
          />
        )}
      </div>
    </main>
  )
}
