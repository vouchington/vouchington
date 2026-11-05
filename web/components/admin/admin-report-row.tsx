'use client'

import Link from 'next/link'
import { Checkbox } from '@/components/ui/checkbox'
import { TimeAgo } from '@/components/shared/time-ago'
import { useModerationTargetLabel } from '@/components/moderation/use-moderation-target-label'
import { ModerationSlaBadge } from '@/components/moderation/moderation-queue-badges'
import { UserModNotesCell } from '@/components/moderation/user-mod-notes-cell'
import { cn } from '@/lib/utils'
import { getUserLabel } from '@/lib/users/user-helpers'
import { createUserPathname } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import { AdminReportJudgementCell } from './admin-report-judgement-cell'
import { AdminReportRowActions } from './admin-report-row-actions'
import { AdminReportTargetCell } from './admin-report-target-cell'
import type { AdminModerationReport } from './reports-client-types'

interface AdminReportRowProps {
  active: boolean
  disabled: boolean
  onActiveChange: (reportId: string) => void
  onResolve: (reportId: string, status: 'reviewed' | 'dismissed') => void
  onRerun: (reportId: string) => void
  /** Called after a warn action succeeds so the caller can remove the now-actioned report. */
  onWarn?: (reportId: string) => void
  /** Called after a ban-evasion confirm/dismiss action so the caller can remove the now-actioned report. */
  onBanEvasionAction?: (reportId: string) => void
  onSelectionToggle: (reportId: string) => void
  report: AdminModerationReport
  selected: boolean
}

export function AdminReportRow({
  active,
  disabled,
  onActiveChange,
  onResolve,
  onRerun,
  onWarn,
  onBanEvasionAction,
  onSelectionToggle,
  report,
  selected,
}: AdminReportRowProps) {
  const t = useTranslations()
  const targetLabelFor = useModerationTargetLabel()
  const targetLabel = targetLabelFor(report.target_label)
  const deletedUserLabel = t('shared.user.deletedUser')
  const reporterLabel = getUserLabel(
    {
      username: report.reporter_username,
      display_account: { name: report.reporter_display_name },
    },
    deletedUserLabel,
  )

  return (
    <tr
      data-pw='report-row'
      data-moderation-queue-key={report.id}
      data-active={active}
      className={cn(
        'outline-none transition-colors',
        active && 'bg-muted/60 ring-2 ring-inset ring-ring',
      )}
      tabIndex={0}
      onFocus={() => onActiveChange(report.id)}
    >
      <td className='px-6 py-4'>
        <Checkbox
          aria-label={t('extracted.admin.adminReportRow.selectTargetlabelReport_47c84111', {
            targetLabel,
          })}
          data-pw='report-row-checkbox'
          checked={selected}
          disabled={disabled}
          onCheckedChange={() => onSelectionToggle(report.id)}
        />
      </td>
      <td className='whitespace-nowrap px-6 py-4 text-sm tabular-nums'>
        <div className='flex flex-col items-start gap-2'>
          <TimeAgo date={report.created_at} />
          <ModerationSlaBadge createdAt={report.created_at} />
        </div>
      </td>
      <td className='px-6 py-4 text-sm'>
        {report.community_ban_evasion ? (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.admin.adminReportRow.system_6725e7bb')}
          </span>
        ) : report.reporter_username ? (
          <Link
            href={createUserPathname(report.reporter_username)}
            className='underline'
            prefetch={false}
          >
            {reporterLabel}
          </Link>
        ) : report.reporter_user_id ? (
          <span className='text-xs'>{reporterLabel}</span>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.admin.adminReportRow.text_bda05058')}
          </span>
        )}
      </td>
      <AdminReportTargetCell
        report={report}
        targetLabel={targetLabel}
        targetLabelFor={targetLabelFor}
      />
      <td
        className='px-6 py-4 text-sm'
        data-pw='admin-reports-reason'
      >
        {report.reason}
      </td>
      <td className='px-6 py-4 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {report.status}
        </span>
      </td>
      <AdminReportJudgementCell report={report} />
      <td className='max-w-sm whitespace-pre-wrap break-words px-6 py-4 text-sm'>
        {report.note ?? '-'}
      </td>
      <td className='px-6 py-4 text-sm text-xs'>
        {report.resolved_by_id
          ? getUserLabel(
              {
                username: report.resolver_username,
                display_account: { name: report.resolver_display_name },
              },
              deletedUserLabel,
            )
          : '-'}
      </td>
      <UserModNotesCell targetUserId={report.entity_type === 'user' ? report.entity_id : null} />
      <AdminReportRowActions
        disabled={disabled}
        onBanEvasionAction={onBanEvasionAction}
        onResolve={onResolve}
        onRerun={onRerun}
        onWarn={onWarn}
        report={report}
        targetLabel={targetLabel}
      />
    </tr>
  )
}
