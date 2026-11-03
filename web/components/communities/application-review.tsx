/* eslint-disable max-lines -- Application review component requires detailed UI for actions, answers, and message display. */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/shared/empty-state'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { approveApplication, rejectApplication } from '@/lib/api/client'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type {
  CommunityApplicationStatus,
  CommunityApplicationsResponseBody,
} from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getUserLabel } from '@/lib/users/user-helpers'
import { ApplicationDetail } from './application-detail'

interface ApplicationReviewProps {
  data: CommunityApplicationsResponseBody
  communitySlug: string
}

interface ActiveAction {
  applicationId: string
  type: 'reject'
}

export function ApplicationReview({ data, communitySlug }: ApplicationReviewProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const endpoint = `/api/v1/communities/${encodeURIComponent(communitySlug)}/applications`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, {})
  const results = mergePageResultsById(pages)
  const communityApplications = mergeRecords(pages, page => page.community_application_summaries)
  const users = mergeRecords(pages, page => page.users)
  const [loading, setLoading] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusOverrides, setStatusOverrides] = useState<
    Readonly<Record<string, CommunityApplicationStatus>>
  >({})
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)

  const applications = results.flatMap(result => {
    const application = communityApplications[result.id]
    return application
      ? [{ ...application, status: statusOverrides[application.id] ?? application.status }]
      : []
  })

  if (applications.length === 0 && !hasNextPage) {
    return (
      <EmptyState
        icon='inbox'
        title={t('extracted.communities.applicationReview.noApplicationsToReview_9bb6376c')}
        description={t(
          'extracted.communities.applicationReview.pendingMemberApplicationsWillShow_3fa568b1',
        )}
        className='rounded-md border bg-card p-4'
      />
    )
  }

  async function handleApprove(applicationId: string) {
    setError(null)
    setLoading(applicationId)
    try {
      await approveApplication(communitySlug, applicationId)
      setStatusOverrides(current => ({ ...current, [applicationId]: 'approved' }))
      refresh()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('extracted.communities.applicationReview.failedToApproveApplication_ebdd8f6e'),
      )
    } finally {
      setLoading(null)
    }
  }

  async function handleRejectSubmit(applicationId: string) {
    setError(null)
    setLoading(applicationId)
    try {
      await rejectApplication(communitySlug, applicationId, rejectionReason)
      setStatusOverrides(current => ({ ...current, [applicationId]: 'rejected' }))
      setActiveAction(null)
      setRejectionReason('')
      refresh()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('extracted.communities.applicationReview.failedToRejectApplication_a6453cea'),
      )
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className='space-y-4'>
      {error && (
        <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{error}</div>
      )}
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        <div className='space-y-4'>
          {applications.map(application => {
            const user = users[application.user_id]
            const isPending = application.status === 'pending'
            const isApproved = application.status === 'approved'
            const isRejected = application.status === 'rejected'
            const isOpen = openApplicationId === application.id

            return (
              <div
                key={application.id}
                className='rounded-md border bg-card p-4'
              >
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='font-medium'>
                      {getUserLabel(user, t('shared.user.deletedUser'))}
                    </p>
                    <p
                      className='text-xs text-muted-foreground'
                      suppressHydrationWarning
                    >
                      {t('extracted.communities.applicationReview.appliedDate_6e231f5e', {
                        date: new Date(application.created_at).toLocaleDateString(),
                      })}
                    </p>
                  </div>
                  {isApproved && (
                    <Badge>{t('extracted.communities.applicationReview.approved_87b42e40')}</Badge>
                  )}
                  {isRejected && (
                    <Badge variant='destructive'>
                      {t('extracted.communities.applicationReview.rejected_aea4a04a')}
                    </Badge>
                  )}
                  {isPending && (
                    <Badge variant='outline'>
                      {t('extracted.communities.applicationReview.pending_331551b0')}
                    </Badge>
                  )}
                </div>

                {isOpen ? (
                  <ApplicationDetail
                    communitySlug={communitySlug}
                    applicationId={application.id}
                  />
                ) : (
                  application.message_preview && (
                    <div className='mt-3'>
                      <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                        {t('extracted.communities.applicationReview.message_2f77668a')}
                      </p>
                      <p className='mt-1 whitespace-pre-wrap break-words text-sm'>
                        {application.message_preview}
                      </p>
                    </div>
                  )
                )}

                <Button
                  data-pw='application-review-toggle-details'
                  className='mt-3'
                  size='sm'
                  variant='ghost'
                  aria-expanded={isOpen}
                  onClick={() => setOpenApplicationId(isOpen ? null : application.id)}
                >
                  {isOpen
                    ? t('extracted.communities.applicationReview.hideDetails_c9722a7a')
                    : t('extracted.communities.applicationReview.showDetails_1af77ee2')}
                </Button>

                {isPending &&
                  (activeAction?.applicationId === application.id &&
                  activeAction.type === 'reject' ? (
                    <div className='mt-4 space-y-3'>
                      <Textarea
                        aria-label={t(
                          'extracted.communities.applicationReview.rejectionReason_e5749926',
                        )}
                        value={rejectionReason}
                        onChange={e => setRejectionReason(e.target.value)}
                        placeholder={t(
                          'extracted.communities.applicationReview.reasonForRejectionOptional_e546287e',
                        )}
                        rows={2}
                      />
                      <div className='flex gap-2'>
                        <Button
                          data-pw='application-review-confirm-reject'
                          size='sm'
                          variant='destructive'
                          loading={loading === application.id}
                          disabled={loading === application.id}
                          onClick={() => handleRejectSubmit(application.id)}
                        >
                          {loading === application.id
                            ? t('extracted.communities.applicationReview.rejecting_47f29154')
                            : t('extracted.communities.applicationReview.confirmReject_48426f9f')}
                        </Button>
                        <Button
                          data-pw='application-review-cancel'
                          size='sm'
                          variant='outline'
                          onClick={() => {
                            setActiveAction(null)
                            setRejectionReason('')
                          }}
                        >
                          {t('extracted.communities.applicationReview.cancel_19766ed6')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className='mt-4 flex gap-2'>
                      <Button
                        data-pw='application-review-approve'
                        size='sm'
                        loading={loading === application.id}
                        disabled={loading === application.id}
                        onClick={() => handleApprove(application.id)}
                      >
                        {loading === application.id
                          ? t('extracted.communities.applicationReview.approving_cee0e61b')
                          : t('extracted.communities.applicationReview.approve_6007acbe')}
                      </Button>
                      <Button
                        data-pw='application-review-reject'
                        size='sm'
                        variant='outline'
                        disabled={loading === application.id}
                        onClick={() => {
                          setActiveAction({ applicationId: application.id, type: 'reject' })
                          setRejectionReason('')
                        }}
                      >
                        {t('extracted.communities.applicationReview.reject_ab604a36')}
                      </Button>
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      </InfiniteScroll>
    </div>
  )
}
