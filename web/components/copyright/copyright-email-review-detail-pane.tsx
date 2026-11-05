'use client'

import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { CopyrightEmailIntakeQueueItem } from '@/types/copyright-notices'
import { CopyrightEmailLegalProcessAction } from './copyright-email-legal-process-action'
import { CopyrightEmailReviewDetail } from './copyright-email-review-detail'
import { useCopyrightEmailReviewDetailState } from './copyright-email-review-detail-state'
import type { CopyrightEmailReviewQueue } from './copyright-email-review-queue-state'

type ReviewQueue = CopyrightEmailReviewQueue

export function CopyrightEmailReviewDetailPane({
  items,
  refreshTimedOut,
  resetToFirstPage,
  children,
}: {
  items: CopyrightEmailIntakeQueueItem[]
  refreshTimedOut: boolean
  resetToFirstPage: ReviewQueue['resetToFirstPage']
  children: (review: {
    loading: boolean
    setError: (value: string | null) => void
    setSuccess: (value: string | null) => void
    selectQueueItem: (id: string) => void | Promise<void>
  }) => ReactNode
}) {
  const detailState = useCopyrightEmailReviewDetailState(items, resetToFirstPage)
  const handleChangeDraft = detailState.onChangeDraft
  const handleChangeRationale = detailState.setRationale
  const handleChangeManualFallbackReason = detailState.setManualFallbackReason
  const handleChangeReplyEmail = detailState.setReplyEmail
  const handleChangeCorrespondenceDraft = detailState.setCorrespondenceDraft
  const statusTone = detailState.error || refreshTimedOut || detailState.detailRefreshTimedOut
  return (
    <>
      {statusTone && (
        <Alert variant={detailState.error ? 'destructive' : undefined}>
          <AlertTitle>
            {detailState.error ? 'Review action failed' : 'AI review is still pending'}
          </AlertTitle>
          <AlertDescription>
            {detailState.error ??
              'The AI recommendation is taking longer than expected. Refresh to check again.'}
          </AlertDescription>
        </Alert>
      )}
      {detailState.success && (
        <Alert>
          <AlertDescription>{detailState.success}</AlertDescription>
        </Alert>
      )}
      <div className='grid gap-4 md:grid-cols-2'>
        <div>
          {children({
            loading: detailState.loading,
            setError: detailState.setError,
            setSuccess: detailState.setSuccess,
            selectQueueItem: detailState.selectQueueItem,
          })}
        </div>
        {detailState.detail && (
          <div className='space-y-4'>
            <CopyrightEmailReviewDetail
              key={detailState.detail.id}
              detail={detailState.detail}
              draft={detailState.draft}
              loading={detailState.loading}
              rationale={detailState.rationale}
              manualFallbackReason={detailState.manualFallbackReason}
              replyEmail={detailState.replyEmail}
              correspondenceDraft={detailState.correspondenceDraft}
              onChangeDraft={handleChangeDraft}
              onChangeRationale={handleChangeRationale}
              onChangeManualFallbackReason={handleChangeManualFallbackReason}
              onChangeReplyEmail={handleChangeReplyEmail}
              onChangeCorrespondenceDraft={handleChangeCorrespondenceDraft}
              onApproveInitial={() => detailState.approve()}
              onRejectInitial={() => detailState.reject()}
              onRequestInformation={message => detailState.requestInformation(message)}
              onAdmitCorrespondence={() => detailState.admitCorrespondence()}
              onRejectCorrespondence={() => detailState.rejectCorrespondence()}
              onAssociateWithNotice={noticeId => detailState.associateWithNotice(noticeId)}
            />
            <CopyrightEmailLegalProcessAction
              key={`legal-process-${detailState.detail.id}`}
              detail={detailState.detail}
              disabled={detailState.loading}
              onRecorded={queue => {
                detailState.recordLegalProcess(queue)
              }}
            />
          </div>
        )}
      </div>
    </>
  )
}
