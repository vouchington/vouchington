'use client'

import { AlertTriangle, Check, MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityModerationReport } from '@/types/api-responses'
import { ModQueueBanEvasionActions } from './mod-queue-ban-evasion'
import { ModQueueWarnButton } from './mod-queue-warn-button'
import type { ModQueueReportActions } from './use-mod-queue-report-actions'

export function ModQueueReportCardActions({
  bulkDisabled,
  communitySlug,
  currentUserId,
  isStaff,
  loading,
  onBanEvasionAction,
  onResolve,
  onWarn,
  report,
  reportActions,
}: {
  bulkDisabled: boolean
  communitySlug: string
  currentUserId: string | null
  isStaff: boolean
  loading: string | null
  onBanEvasionAction?: (reportId: string) => void
  onResolve: (report: CommunityModerationReport, status: 'reviewed' | 'dismissed') => void
  onWarn?: (reportId: string) => void
  report: CommunityModerationReport
  reportActions: ModQueueReportActions
}) {
  const t = useTranslations()
  const {
    claimingId,
    discussingId,
    escalatingId,
    handleClaim,
    handleDeEscalate,
    handleDiscuss,
    handleEscalate,
    handleRelease,
    handleSendModmail,
    sendingModmail,
  } = reportActions
  const targetUserId = report.target_user_id ?? null
  const isBanEvasion = Boolean(report.community_ban_evasion)
  const claim = report.claim ?? null
  const isClaimedByMe = claim !== null && claim.claimed_by_id === currentUserId
  const isEscalated = Boolean(report.escalated_at)

  return (
    <div className='mt-4 flex flex-wrap gap-2'>
      {isBanEvasion ? (
        <ModQueueBanEvasionActions
          banEvasion={report.community_ban_evasion!}
          entityId={report.entity_id}
          reportId={report.id}
          disabled={bulkDisabled || loading === report.id}
          onAction={id => onBanEvasionAction?.(id)}
        />
      ) : (
        <>
          <Button
            data-pw='mod-queue-reports-reviewed'
            size='sm'
            disabled={bulkDisabled || loading === report.id}
            onClick={() => onResolve(report, 'reviewed')}
          >
            <Check className='size-4' />
            {t('extracted.communities.modQueueReports.reviewed_fad6057b')}
          </Button>
          <Button
            data-pw='mod-queue-reports-dismiss'
            size='sm'
            variant='outline'
            disabled={bulkDisabled || loading === report.id}
            onClick={() => onResolve(report, 'dismissed')}
          >
            <X className='size-4' />
            {t('extracted.communities.modQueueReports.dismiss_48845bff')}
          </Button>
          {targetUserId ? (
            <ModQueueWarnButton
              userId={targetUserId}
              communitySlug={communitySlug}
              reportId={report.id}
              disabled={bulkDisabled || loading === report.id}
              onIssued={() => onWarn?.(report.id)}
            />
          ) : null}
          {isClaimedByMe ? (
            <Button
              size='sm'
              variant='outline'
              disabled={claimingId === report.id}
              loading={claimingId === report.id}
              onClick={() => {
                void handleRelease(report.id)
              }}
              data-pw='release-report-button'
            >
              {t('extracted.communities.modQueueReports.release_e020e3c6')}
            </Button>
          ) : (
            <Button
              size='sm'
              variant='outline'
              disabled={claimingId === report.id}
              loading={claimingId === report.id}
              onClick={() => {
                void handleClaim(report.id)
              }}
              data-pw='claim-report-button'
            >
              {t('extracted.communities.modQueueReports.claim_4ca41db0')}
            </Button>
          )}
          <Button
            size='sm'
            variant='outline'
            disabled={discussingId === report.id}
            loading={discussingId === report.id}
            onClick={() => {
              void handleDiscuss(report.id)
            }}
            data-pw='discuss-report-button'
          >
            <MessageSquare className='size-4' />
            {t('extracted.communities.modQueueReports.discuss_3df75fc7')}
          </Button>
          {isEscalated ? (
            <Button
              size='sm'
              variant='outline'
              disabled={escalatingId === report.id}
              loading={escalatingId === report.id}
              onClick={() => {
                void handleDeEscalate(report.id)
              }}
              data-pw='de-escalate-report-button'
            >
              <AlertTriangle className='size-4' />
              {t('extracted.communities.modQueueReports.removeEscalation_1ed2ef3d')}
            </Button>
          ) : (
            <Button
              size='sm'
              variant='outline'
              disabled={escalatingId === report.id}
              loading={escalatingId === report.id}
              onClick={() => {
                void handleEscalate(report.id)
              }}
              data-pw='escalate-report-button'
            >
              <AlertTriangle className='size-4' />
              {t('extracted.communities.modQueueReports.escalate_d563aaf7')}
            </Button>
          )}
          {isStaff ? (
            <Button
              size='sm'
              variant='outline'
              disabled={sendingModmail === report.id}
              loading={sendingModmail === report.id}
              onClick={() => {
                void handleSendModmail(report)
              }}
              data-pw='send-modmail-button'
            >
              <MessageSquare className='size-4' />
              {t('extracted.communities.modQueueReports.sendMessage_0fe0571f')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}
