'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { CommunityApplicationSummary } from '@/types/api-responses'
import type { PublicUser } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getUserLabel } from '@/lib/users/user-helpers'

interface ApplicationReviewCardProps {
  application: CommunityApplicationSummary
  isLoading: boolean
  isRejecting: boolean
  onApprove: () => void
  onCancelReject: () => void
  onConfirmReject: () => void
  onRejectionReasonChange: (reason: string) => void
  onShowDetails: () => void
  onStartReject: () => void
  rejectionReason: string
  user: PublicUser | undefined
}

export function ApplicationReviewCard({
  application,
  isLoading,
  isRejecting,
  onApprove,
  onCancelReject,
  onConfirmReject,
  onRejectionReasonChange,
  onShowDetails,
  onStartReject,
  rejectionReason,
  user,
}: ApplicationReviewCardProps) {
  const t = useTranslations()
  const isPending = application.status === 'pending'
  const isApproved = application.status === 'approved'
  const isRejected = application.status === 'rejected'

  return (
    <div className='rounded-md border bg-card p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='font-medium'>{getUserLabel(user, t('shared.user.deletedUser'))}</p>
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

      {application.message_preview && (
        <div className='mt-3'>
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            {t('extracted.communities.applicationReview.message_2f77668a')}
          </p>
          <p className='mt-1 whitespace-pre-wrap break-words text-sm'>
            {application.message_preview}
          </p>
        </div>
      )}
      <p className='mt-3 text-xs text-muted-foreground'>
        {t('extracted.communities.applicationReview.answerCount_90a51327', {
          count: application.answer_count,
        })}
      </p>

      <Button
        data-pw='application-review-view-details'
        className='mt-3'
        size='sm'
        variant='ghost'
        onClick={onShowDetails}
      >
        {t('extracted.communities.applicationReview.showDetails_1af77ee2')}
      </Button>

      {isPending &&
        (isRejecting ? (
          <div className='mt-4 space-y-3'>
            <Textarea
              aria-label={t('extracted.communities.applicationReview.rejectionReason_e5749926')}
              value={rejectionReason}
              onChange={e => onRejectionReasonChange(e.target.value)}
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
                loading={isLoading}
                disabled={isLoading}
                onClick={onConfirmReject}
              >
                {isLoading
                  ? t('extracted.communities.applicationReview.rejecting_47f29154')
                  : t('extracted.communities.applicationReview.confirmReject_48426f9f')}
              </Button>
              <Button
                data-pw='application-review-cancel'
                size='sm'
                variant='outline'
                onClick={onCancelReject}
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
              loading={isLoading}
              disabled={isLoading}
              onClick={onApprove}
            >
              {isLoading
                ? t('extracted.communities.applicationReview.approving_cee0e61b')
                : t('extracted.communities.applicationReview.approve_6007acbe')}
            </Button>
            <Button
              data-pw='application-review-reject'
              size='sm'
              variant='outline'
              disabled={isLoading}
              onClick={onStartReject}
            >
              {t('extracted.communities.applicationReview.reject_ab604a36')}
            </Button>
          </div>
        ))}
    </div>
  )
}
