'use client'

import { Badge } from '@/components/ui/badge'
import { ReportJudgementCounts } from '@/components/moderation/report-judgement-counts'
import { judgementLabel, judgementVariant } from '@/components/admin/report-judgement-format'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { CommunityModerationReport } from '@/types/api-responses'

export function ModQueueReportDetails({
  isBanEvasion,
  isStaff,
  report,
}: {
  isBanEvasion: boolean
  isStaff: boolean
  report: CommunityModerationReport
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <>
      {!isBanEvasion && (
        <p className='mt-2 text-sm'>
          <span className='font-medium'>
            {t('extracted.communities.modQueueReports.reason_3425d108')}
          </span>{' '}
          {report.reason}
        </p>
      )}
      {isStaff && report.note ? (
        <p
          className={`${isBanEvasion ? 'mt-2' : 'mt-1'} whitespace-pre-wrap break-words text-sm text-muted-foreground`}
        >
          {report.note}
        </p>
      ) : null}
      {report.judgement ? (
        <div className='mt-2 flex flex-wrap items-center gap-2'>
          <Badge variant={judgementVariant(report.judgement.recommended_action)}>
            {judgementLabel(report.judgement.recommended_action)}
          </Badge>
          {report.judgement.is_stale ? (
            <Badge variant='outline'>
              {t('extracted.communities.modQueueReports.outdated_c759f42e')}
            </Badge>
          ) : null}
          <span className='text-xs text-muted-foreground'>{report.judgement.public_response}</span>
          <ReportJudgementCounts
            judgedReportCount={report.judgement.judged_report_count}
            judgedReportCountCapped={report.judgement.judged_report_count_capped}
            currentReportCount={report.judgement.current_report_count}
            currentReportCountCapped={report.judgement.current_report_count_capped}
            uiLocale={uiLocale}
          />
        </div>
      ) : null}
    </>
  )
}
