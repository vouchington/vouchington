'use client'

import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { accessibleNameWithVisibleText } from '@/lib/a11y/accessible-name-with-visible-text'
import { ReportJudgementCounts } from '@/components/moderation/report-judgement-counts'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { judgementLabel, judgementVariant } from './report-judgement-format'
import type { AdminModerationReport } from './reports-client-types'

export function AdminReportJudgementCell({ report }: { report: AdminModerationReport }) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const judgementAction = report.judgement
    ? judgementLabel(report.judgement.recommended_action)
    : null
  const judgementOutdated = report.judgement?.is_stale
    ? t('extracted.admin.adminReportRow.outdated_c759f42e')
    : null
  const judgementName =
    judgementAction === null
      ? null
      : accessibleNameWithVisibleText(
          judgementOutdated ? `${judgementAction} ${judgementOutdated}` : judgementAction,
          t('extracted.admin.adminReportRow.viewAiJudgementDetailsAction_9a18f800', {
            action: judgementAction,
          }),
        )

  return (
    <td className='px-6 py-4 text-sm'>
      {report.judgement ? (
        <Popover>
          <PopoverTrigger
            className='cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
            aria-label={judgementName ?? undefined}
          >
            <Badge
              asChild
              variant={judgementVariant(report.judgement.recommended_action)}
            >
              <span>{judgementAction}</span>
            </Badge>
            {judgementOutdated ? (
              <>
                {' '}
                <Badge
                  asChild
                  variant='outline'
                >
                  <span>{judgementOutdated}</span>
                </Badge>
              </>
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
            <ReportJudgementCounts
              judgedReportCount={report.judgement.judged_report_count}
              judgedReportCountCapped={report.judgement.judged_report_count_capped}
              currentReportCount={report.judgement.current_report_count}
              currentReportCountCapped={report.judgement.current_report_count_capped}
              uiLocale={uiLocale}
            />
          </PopoverContent>
        </Popover>
      ) : (
        <span className='text-xs text-muted-foreground'>
          {t('extracted.admin.adminReportRow.text_bda05058')}
        </span>
      )}
    </td>
  )
}
