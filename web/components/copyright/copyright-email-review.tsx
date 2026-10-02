'use client'

import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { CopyrightEmailLegalProcessAction } from './copyright-email-legal-process-action'
import { CopyrightEmailQueueItem } from './copyright-email-queue-item'
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
  const [replyEmail, setReplyEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const {
    admitCorrespondence,
    approve,
    reject,
    rejectCorrespondence,
    requestInformation,
    selectIntake,
  } = useCopyrightEmailReviewActions({
    correspondenceDraft,
    detail,
    draft,
    manualFallbackReason,
    rationale,
    replyEmail,
    setCorrespondenceDraft,
    setDetail,
    setDraft,
    setError,
    resetQueue: page => resetToFirstPage?.(page),
    setLoading,
    setManualFallbackReason,
    setRationale,
    setReplyEmail,
    setSuccess,
  })
  return (
    <main className='mx-auto max-w-4xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Copyright email review</h1>
      <p className='text-muted-foreground'>
        Staff must verify each parsed email and approve, reject, or ask the sender for more
        information before any case action.
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
          {items.length === 0 && !hasNextPage ? (
            <p className='text-muted-foreground'>No copyright emails need review.</p>
          ) : (
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
                  <CopyrightEmailQueueItem
                    key={item.id}
                    item={item}
                    disabled={loading}
                    onSelect={selectIntake}
                    resetQueue={page => resetToFirstPage?.(page)}
                    setError={setError}
                    setSuccess={setSuccess}
                  />
                ))}
              </ul>
            </InfiniteScroll>
          )}
        </div>
        {detail && (
          <div className='space-y-4'>
            <CopyrightEmailReviewDetail
              key={detail.id}
              detail={detail}
              draft={draft}
              loading={loading}
              rationale={rationale}
              manualFallbackReason={manualFallbackReason}
              replyEmail={replyEmail}
              correspondenceDraft={correspondenceDraft}
              onChangeDraft={setDraft}
              onChangeRationale={setRationale}
              onChangeManualFallbackReason={setManualFallbackReason}
              onChangeReplyEmail={setReplyEmail}
              onChangeCorrespondenceDraft={setCorrespondenceDraft}
              onApproveInitial={() => approve()}
              onRejectInitial={() => reject()}
              onRequestInformation={message => requestInformation(message)}
              onAdmitCorrespondence={() => admitCorrespondence()}
              onRejectCorrespondence={() => rejectCorrespondence()}
            />
            <CopyrightEmailLegalProcessAction
              key={`legal-process-${detail.id}`}
              detail={detail}
              disabled={loading}
              onRecorded={queue => {
                setDetail(current => (current?.id === detail.id ? null : current))
                setSuccess('The email intake was recorded as legal process. No reply was sent.')
                if (queue) resetToFirstPage?.(queue)
                else setError('The decision was recorded, but the queue could not be reloaded.')
              }}
            />
          </div>
        )}
      </div>
    </main>
  )
}
