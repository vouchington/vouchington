'use client'
/* oxlint-disable max-lines -- the table row owns the complete moderation report presentation; action request logic lives in focused child components */

import Link from 'next/link'
import { Check, ExternalLink, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TimeAgo } from '@/components/shared/time-ago'
import { ReportTargetContent } from '@/components/moderation/report-target-content'
import { cn } from '@/lib/utils'
import { judgementLabel, judgementVariant } from './report-judgement-format'
import { UserModNotesCell } from '@/components/moderation/user-mod-notes-cell'
import {
  ModerationSlaBadge,
  ReportCountBadge,
} from '@/components/moderation/moderation-queue-badges'
import { ReportRowWarnButton } from './report-row-warn-button'
import { communityHref, createUserPathname } from '@/lib/links/entity-href'
import type { AdminModerationReport } from './reports-client-types'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import { ReportBanEvasionActions } from './report-ban-evasion-actions'

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
  const targetLabel = report.target_label ?? report.entity_id
  const ordinaryPending = isOrdinaryPendingReport(report)

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
            {report.reporter_username}
          </Link>
        ) : report.reporter_user_id ? (
          <span className='font-mono text-xs'>{report.reporter_user_id}</span>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.admin.adminReportRow.text_bda05058')}
          </span>
        )}
      </td>
      <td className='px-6 py-4 text-sm'>
        <div className='flex flex-col gap-1'>
          <span className='text-xs uppercase text-muted-foreground'>{report.entity_type}</span>
          {report.target_path ? (
            <Link
              href={report.target_path}
              className='font-medium underline'
              prefetch={false}
            >
              <ReportTargetContent
                fallback={targetLabel}
                targetContent={report.target_content}
              />
            </Link>
          ) : (
            <span>
              <ReportTargetContent
                fallback={targetLabel}
                targetContent={report.target_content}
              />
            </span>
          )}
          {report.admin_action_path && report.admin_action_path !== report.target_path ? (
            <Link
              href={report.admin_action_path}
              className='inline-flex items-center gap-1 text-xs underline'
              prefetch={false}
            >
              {t('extracted.admin.adminReportRow.moderationSurface_452781a6')}
              <ExternalLink className='size-3' />
            </Link>
          ) : null}
          <ReportCountBadge count={report.report_count} />
          {report.community_ban_evasion ? (
            <Popover>
              <PopoverTrigger
                className='inline-flex cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                aria-label={t('extracted.admin.adminReportRow.viewBanEvasionFlagDetails_a639ac11')}
              >
                <Badge
                  asChild
                  data-pw='ban-evasion-badge'
                  variant='destructive'
                >
                  <span className='inline-flex items-center gap-1'>
                    <ShieldAlert className='size-3' />
                    {t('extracted.admin.adminReportRow.banEvasion_9ce38440')}
                  </span>
                </Badge>
              </PopoverTrigger>
              <PopoverContent
                data-pw='ban-evasion-detail'
                className='w-72 space-y-2 text-sm'
              >
                <p className='font-medium'>
                  {t('extracted.admin.adminReportRow.suspectedBanEvasion_c9e82beb')}
                </p>
                <p className='text-muted-foreground'>
                  {t('extracted.admin.adminReportRow.community_a497fe96')}{' '}
                  <Link
                    href={communityHref({ slug: report.community_ban_evasion.community_slug })}
                    className='underline'
                    prefetch={false}
                  >
                    {report.community_ban_evasion.community_slug}
                  </Link>
                </p>
                <p className='text-muted-foreground'>
                  {t('extracted.admin.adminReportRow.sourceUser_c72c579b')}{' '}
                  {report.community_ban_evasion.source_username ? (
                    <Link
                      href={createUserPathname(report.community_ban_evasion.source_username)}
                      className='underline'
                      prefetch={false}
                    >
                      {report.community_ban_evasion.source_username}
                    </Link>
                  ) : report.community_ban_evasion.source_user_id ? (
                    <span className='font-mono text-xs'>
                      {report.community_ban_evasion.source_user_id}
                    </span>
                  ) : (
                    <span className='text-muted-foreground'>Hidden</span>
                  )}
                </p>
                {typeof report.community_ban_evasion.score === 'number' ? (
                  <p className='text-muted-foreground'>
                    {t('extracted.admin.adminReportRow.scoreScore_fa6f0c78', {
                      score: `${(report.community_ban_evasion.score * 100).toFixed(0)}%`,
                    })}
                  </p>
                ) : null}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </td>
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
      <td className='px-6 py-4 text-sm'>
        {report.judgement ? (
          <Popover>
            <PopoverTrigger
              className='cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              aria-label={t(
                'extracted.admin.adminReportRow.viewAiJudgementDetailsAction_9a18f800',
                {
                  action: judgementLabel(report.judgement.recommended_action),
                },
              )}
            >
              <Badge
                asChild
                variant={judgementVariant(report.judgement.recommended_action)}
              >
                <span>{judgementLabel(report.judgement.recommended_action)}</span>
              </Badge>
              {report.judgement.is_stale ? (
                <Badge
                  asChild
                  variant='outline'
                >
                  <span>{t('extracted.admin.adminReportRow.outdated_c759f42e')}</span>
                </Badge>
              ) : null}
            </PopoverTrigger>
            <PopoverContent className='w-80 space-y-3 text-sm'>
              <div>
                <p className='mb-1 font-medium'>
                  {t('extracted.admin.adminReportRow.publicResponse_e75e1903')}
                </p>
                <p className='whitespace-pre-wrap break-words text-muted-foreground'>
                  {report.judgement.public_response}
                </p>
              </div>
              <div>
                <p className='mb-1 font-medium'>
                  {t('extracted.admin.adminReportRow.internalResponse_ae920e5f')}
                </p>
                <p className='whitespace-pre-wrap break-words text-muted-foreground'>
                  {report.judgement.internal_response}
                </p>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.admin.adminReportRow.text_bda05058')}
          </span>
        )}
      </td>
      <td className='max-w-sm whitespace-pre-wrap break-words px-6 py-4 text-sm'>
        {report.note ?? '-'}
      </td>
      <td className='px-6 py-4 text-sm font-mono text-xs'>{report.resolved_by_id ?? '-'}</td>
      <UserModNotesCell targetUserId={report.entity_type === 'user' ? report.entity_id : null} />
      <td className='px-6 py-4'>
        <div className='flex flex-wrap gap-2'>
          {report.status === 'pending' ? (
            <>
              {ordinaryPending ? (
                <>
                  <Button
                    size='touchSm'
                    disabled={disabled}
                    aria-label={t(
                      'extracted.admin.adminReportRow.markTargetlabelReportReviewed_9ef2f96d',
                      {
                        targetLabel,
                      },
                    )}
                    onClick={() => onResolve(report.id, 'reviewed')}
                  >
                    <Check className='size-4' />
                    {t('extracted.admin.adminReportRow.reviewed_fad6057b')}
                  </Button>
                  <Button
                    size='touchSm'
                    variant='outline'
                    disabled={disabled}
                    aria-label={t(
                      'extracted.admin.adminReportRow.dismissTargetlabelReport_1a2f24e7',
                      {
                        targetLabel,
                      },
                    )}
                    onClick={() => onResolve(report.id, 'dismissed')}
                  >
                    <X className='size-4' />
                    {t('extracted.admin.adminReportRow.dismiss_48845bff')}
                  </Button>
                </>
              ) : null}
              {ordinaryPending && report.target_user_id ? (
                <ReportRowWarnButton
                  userId={report.target_user_id}
                  reportId={report.id}
                  disabled={disabled}
                  onIssued={() => onWarn?.(report.id)}
                />
              ) : null}
              <ReportBanEvasionActions
                disabled={disabled}
                onAction={onBanEvasionAction}
                report={report}
              />
            </>
          ) : null}
          <Button
            size='touchSm'
            variant='outline'
            disabled={disabled}
            aria-label={t(
              'extracted.admin.adminReportRow.reRunAiJudgementForTargetlabel_793a29ff',
              {
                targetLabel,
              },
            )}
            onClick={() => onRerun(report.id)}
          >
            <RefreshCw className='size-4' />
            {t('extracted.admin.adminReportRow.reRunJudgement_8b575390')}
          </Button>
        </div>
      </td>
    </tr>
  )
}
