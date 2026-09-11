'use client'

import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { TimeAgo } from '@/components/shared/time-ago'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserModNotesControl } from '@/components/moderation/user-mod-notes-cell'
import { createUserPathname } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ReportRowWarnButton } from './report-row-warn-button'
import { judgementLabel, judgementVariant } from './report-judgement-format'
import type { AdminModerationReport } from './reports-client-types'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import { ReportBanEvasionActions } from './report-ban-evasion-actions'

export function ReportDetail({
  report,
  disabled,
  rerunning,
  onRerun,
  onWarn,
  onBanEvasionAction,
}: {
  report: AdminModerationReport
  disabled: boolean
  rerunning: boolean
  onRerun: () => void
  onWarn: () => void
  onBanEvasionAction?: (reportId: string) => void
}) {
  const t = useTranslations()
  return (
    <div className='grid gap-2 rounded-md border bg-background p-3 text-sm md:grid-cols-[1fr_auto]'>
      <div className='space-y-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>{report.reason}</Badge>
          <span className='text-muted-foreground'>
            <TimeAgo date={report.created_at} />
          </span>
          {report.reporter_username ? (
            <Link
              href={createUserPathname(report.reporter_username)}
              className='underline'
              prefetch={false}
            >
              {report.reporter_username}
            </Link>
          ) : report.reporter_user_id ? (
            <span className='font-mono text-xs'>{report.reporter_user_id}</span>
          ) : null}
        </div>
        {report.note ? <p className='whitespace-pre-wrap break-words'>{report.note}</p> : null}
        {report.judgement ? (
          <div className='space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant={judgementVariant(report.judgement.recommended_action)}>
                {judgementLabel(report.judgement.recommended_action)}
              </Badge>
              {report.judgement.is_stale ? (
                <Badge variant='outline'>
                  {t('extracted.admin.reportClusterDetail.outdated_c759f42e')}
                </Badge>
              ) : null}
              <span
                data-pw='report-judgement-internal-response'
                className='text-xs text-muted-foreground'
              >
                {report.judgement.internal_response}
              </span>
            </div>
            <p
              data-pw='report-judgement-public-response'
              className='text-xs text-muted-foreground'
            >
              {report.judgement.public_response}
            </p>
          </div>
        ) : null}
      </div>
      <div className='flex flex-wrap items-center justify-end gap-2'>
        <UserModNotesControl
          targetUserId={report.entity_type === 'user' ? report.entity_id : null}
        />
        {isOrdinaryPendingReport(report) && report.target_user_id ? (
          <ReportRowWarnButton
            userId={report.target_user_id}
            reportId={report.id}
            disabled={disabled}
            onIssued={onWarn}
          />
        ) : null}
        <ReportBanEvasionActions
          disabled={disabled}
          onAction={onBanEvasionAction}
          report={report}
        />
        <Button
          size='touchSm'
          variant='outline'
          disabled={disabled}
          onClick={onRerun}
        >
          {rerunning ? (
            <RefreshCw className='size-4 animate-spin' />
          ) : (
            <RefreshCw className='size-4' />
          )}
          {t('extracted.admin.reportClusterDetail.reRunJudgement_8b575390')}
        </Button>
      </div>
    </div>
  )
}
