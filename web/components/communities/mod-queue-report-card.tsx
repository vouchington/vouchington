/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- focusable cards support moderation queue navigation while nested links/buttons keep native behavior. */
'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  ModerationSlaBadge,
  ReportCountBadge,
} from '@/components/moderation/moderation-queue-badges'
import { ReportTargetContent } from '@/components/moderation/report-target-content'
import { useModerationTargetLabel } from '@/components/moderation/use-moderation-target-label'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityModerationReport } from '@/types/api-responses'
import { ModQueueBanEvasionInfo } from './mod-queue-ban-evasion'
import { ModQueueReportCardActions } from './mod-queue-report-card-actions'
import { ModQueueReportDetails } from './mod-queue-report-details'
import type { ModQueueReportActions } from './use-mod-queue-report-actions'

export function ModQueueReportCard({
  activeKey,
  bulkDisabled,
  communitySlug,
  currentUserId,
  isStaff,
  loading,
  onActiveChange,
  onBanEvasionAction,
  onResolve,
  onSelectionToggle,
  onWarn,
  report,
  reportActions,
  selected,
}: {
  activeKey: string | null
  bulkDisabled: boolean
  communitySlug: string
  currentUserId: string | null
  isStaff: boolean
  loading: string | null
  onActiveChange: (key: string) => void
  onBanEvasionAction?: (reportId: string) => void
  onResolve: (report: CommunityModerationReport, status: 'reviewed' | 'dismissed') => void
  onSelectionToggle: (reportId: string) => void
  onWarn?: (reportId: string) => void
  report: CommunityModerationReport
  reportActions: ModQueueReportActions
  selected: boolean
}) {
  const t = useTranslations()
  const targetLabelFor = useModerationTargetLabel()
  const targetLabel = targetLabelFor(report.target_label)
  const queueKey = `report:${report.id}`
  const active = activeKey === queueKey
  const isBanEvasion = Boolean(report.community_ban_evasion)
  const claim = report.claim ?? null
  const isClaimedByMe = claim !== null && claim.claimed_by_id === currentUserId
  const isClaimedByOther = claim !== null && claim.claimed_by_id !== currentUserId
  const isEscalated = Boolean(report.escalated_at)

  return (
    <div
      className={cn(
        'rounded-md border bg-card p-4 outline-none transition-colors',
        active && 'ring-2 ring-ring ring-offset-2',
      )}
      data-report-id={report.id}
      data-pw='mod-queue-report-card'
      data-moderation-queue-key={queueKey}
      data-active={active}
      tabIndex={0}
      onFocus={() => onActiveChange(queueKey)}
    >
      <div className='flex gap-3'>
        <Checkbox
          aria-label={t('extracted.communities.modQueueReports.selectReportForLabel_a4d72044', {
            label: targetLabel,
          })}
          checked={selected}
          disabled={bulkDisabled}
          onCheckedChange={() => onSelectionToggle(report.id)}
        />
        <div className='flex flex-col gap-1'>
          <p className='text-xs uppercase text-muted-foreground'>
            {targetLabelFor(report.entity_type)}
          </p>
          {report.target_path ? (
            <Link
              href={report.target_path}
              className='font-semibold underline'
              prefetch={false}
            >
              <ReportTargetContent
                fallback={targetLabel}
                targetContent={report.target_content}
              />
            </Link>
          ) : (
            <p className='font-semibold'>
              <ReportTargetContent
                fallback={targetLabel}
                targetContent={report.target_content}
              />
            </p>
          )}
          <div className='flex flex-wrap gap-2'>
            <ModerationSlaBadge createdAt={report.created_at} />
            <ReportCountBadge count={report.report_count} />
            {isEscalated && (
              <Badge
                variant='destructive'
                data-pw='report-escalated-badge'
              >
                {t('extracted.communities.modQueueReports.escalated_b710aaaa')}
              </Badge>
            )}
            {isClaimedByMe && (
              <Badge
                variant='outline'
                data-pw='report-claimed-by-me-badge'
              >
                {t('extracted.communities.modQueueReports.claimedByYou_c0a65290')}
              </Badge>
            )}
            {isClaimedByOther && (
              <Badge
                variant='secondary'
                data-pw='report-claimed-by-other-badge'
              >
                {t('extracted.communities.modQueueReports.claimed_ddcd2779')}
              </Badge>
            )}
          </div>
          {report.community_ban_evasion ? (
            <ModQueueBanEvasionInfo banEvasion={report.community_ban_evasion} />
          ) : null}
        </div>
      </div>
      <ModQueueReportDetails
        isBanEvasion={isBanEvasion}
        isStaff={isStaff}
        report={report}
      />
      <ModQueueReportCardActions
        bulkDisabled={bulkDisabled}
        communitySlug={communitySlug}
        currentUserId={currentUserId}
        isStaff={isStaff}
        loading={loading}
        onBanEvasionAction={onBanEvasionAction}
        onResolve={onResolve}
        onWarn={onWarn}
        report={report}
        reportActions={reportActions}
      />
    </div>
  )
}
