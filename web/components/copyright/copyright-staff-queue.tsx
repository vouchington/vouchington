'use client'

import { useState, useTransition } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { listCopyrightReviewQueue } from '@/lib/api/client/copyright-notices'
import onError, { onSuccess } from '@/lib/on-error'
import type { CopyrightStaffQueueItem, CopyrightStaffQueuePage } from '@/types/copyright-notices'
import { CopyrightStaffCase } from './copyright-staff-case'
import type { SubmitRecovery, SubmitReview } from './copyright-staff-review-buttons'

export function CopyrightStaffQueue({ data }: { data: CopyrightStaffQueuePage }) {
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(
      data,
      '/api/v1/copyright-notices/review-queue',
      {},
      {
        loadPage: after => listCopyrightReviewQueue({ after }),
      },
    )
  const noticeById = new Map<string, CopyrightStaffQueueItem>()
  for (const page of pages) {
    for (const notice of page.copyright_notices) noticeById.set(notice.id, notice)
  }
  const notices = [...noticeById.values()]
  const [rationale, setRationale] = useState('')
  const [pending, startTransition] = useTransition()
  const trimmedRationale = rationale.trim()
  const submit: SubmitReview = (action, success) => {
    if (pending || !trimmedRationale) return
    runAction(action, success)
  }
  const submitRecovery: SubmitRecovery = (action, success) => {
    if (pending) return
    runAction(action, success)
  }
  function runAction(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action()
        onSuccess(success)
        window.location.reload()
      } catch (error) {
        onError(error, {
          fallback: 'We could not record that copyright review action.',
          tags: { form: 'copyright-staff-review' },
        })
      }
    })
  }
  if (notices.length === 0 && !hasNextPage)
    return <p className='text-muted-foreground'>No copyright cases need review.</p>
  return (
    <div className='space-y-5'>
      <Textarea
        aria-label='Review rationale'
        placeholder='State the basis for this decision.'
        value={rationale}
        onChange={event => setRationale(event.target.value)}
      />
      <p className='text-sm text-muted-foreground'>A rationale is required for every decision.</p>
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        {notices.map(notice => (
          <CopyrightStaffCase
            key={notice.id}
            notice={notice}
            pending={pending}
            rationale={trimmedRationale}
            submit={submit}
            submitRecovery={submitRecovery}
          />
        ))}
      </InfiniteScroll>
    </div>
  )
}
