'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/shared/empty-state'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { approveApplication, rejectApplication } from '@/lib/api/client'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { CommunityApplicationStatus } from '@/types/api-responses'
import type { CommunityApplicationsResponseBody } from '@/types/api-responses/community-applications'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getUserLabel } from '@/lib/users/user-helpers'
import { ApplicationDetailDialog } from './application-detail'
import { ApplicationReviewCard } from './application-review-card'

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

  const openApplication = applications.find(application => application.id === openApplicationId)

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
          {applications.map(application => (
            <ApplicationReviewCard
              key={application.id}
              application={application}
              user={users[application.user_id]}
              isLoading={loading === application.id}
              isRejecting={
                activeAction?.applicationId === application.id && activeAction.type === 'reject'
              }
              rejectionReason={rejectionReason}
              onRejectionReasonChange={setRejectionReason}
              onApprove={() => handleApprove(application.id)}
              onConfirmReject={() => handleRejectSubmit(application.id)}
              onCancelReject={() => {
                setActiveAction(null)
                setRejectionReason('')
              }}
              onStartReject={() => {
                setActiveAction({ applicationId: application.id, type: 'reject' })
                setRejectionReason('')
              }}
              onShowDetails={() => setOpenApplicationId(application.id)}
            />
          ))}
        </div>
      </InfiniteScroll>
      {openApplication && (
        <ApplicationDetailDialog
          communitySlug={communitySlug}
          applicationId={openApplication.id}
          applicantLabel={getUserLabel(
            users[openApplication.user_id],
            t('shared.user.deletedUser'),
          )}
          appliedDate={t('extracted.communities.applicationReview.appliedDate_6e231f5e', {
            date: new Date(openApplication.created_at).toLocaleDateString(),
          })}
          onClose={() => setOpenApplicationId(null)}
        />
      )}
    </div>
  )
}
