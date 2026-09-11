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
import type { CommunityApplication, CommunityApplicationsResponseBody } from '@/types/api-responses'
import type { PublicUser } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ApplicationReviewProps {
  data: CommunityApplicationsResponseBody
  communitySlug: string
  users?: Record<string, PublicUser>
}

interface ActiveAction {
  applicationId: string
  type: 'reject'
}

export function ApplicationReview({ data, communitySlug, users }: ApplicationReviewProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const endpoint = `/api/v1/communities/${encodeURIComponent(communitySlug)}/applications`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, {})
  const results = mergePageResultsById(pages)
  const communityApplications = mergeRecords(pages, page => page.community_applications)
  const [loading, setLoading] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [applicationOverrides, setApplicationOverrides] = useState<
    Readonly<Record<string, CommunityApplication>>
  >({})

  const applications = results.flatMap(result => {
    const application = communityApplications[result.id]
    return application ? [applicationOverrides[application.id] ?? application] : []
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
      const application = communityApplications[applicationId]
      if (application) {
        setApplicationOverrides(current => ({
          ...current,
          [applicationId]: { ...application, approved_at: new Date().toISOString() },
        }))
      }
      refresh()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
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
      const application = communityApplications[applicationId]
      if (application) {
        setApplicationOverrides(current => ({
          ...current,
          [applicationId]: { ...application, rejected_at: new Date().toISOString() },
        }))
      }
      setActiveAction(null)
      setRejectionReason('')
      refresh()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
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
            const user = users?.[application.user_id]
            const isPending = !application.approved_at && !application.rejected_at
            const isApproved = !!application.approved_at
            const isRejected = !!application.rejected_at

            return (
              <div
                key={application.id}
                className='rounded-md border bg-card p-4'
              >
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='font-medium'>{user?.username ?? application.user_id}</p>
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

                {Object.keys(application.answers).length > 0 && (
                  <div className='mt-3 space-y-2'>
                    {Object.entries(application.answers).map(([key, value]) => (
                      <div key={key}>
                        <p className='text-xs font-medium text-muted-foreground'>{key}</p>
                        <p className='text-sm'>{String(value)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {application.message && (
                  <div className='mt-3'>
                    <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                      {t('extracted.communities.applicationReview.message_2f77668a')}
                    </p>
                    <p className='mt-1 whitespace-pre-wrap break-words text-sm'>
                      {application.message}
                    </p>
                  </div>
                )}

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
