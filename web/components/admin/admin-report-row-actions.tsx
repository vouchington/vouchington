'use client'

import { Check, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { accessibleNameWithVisibleText } from '@/lib/a11y/accessible-name-with-visible-text'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isOrdinaryPendingReport } from './report-action-eligibility'
import { ReportBanEvasionActions } from './report-ban-evasion-actions'
import { ReportRowWarnButton } from './report-row-warn-button'
import type { AdminModerationReport } from './reports-client-types'

export function AdminReportRowActions({
  disabled,
  onBanEvasionAction,
  onResolve,
  onRerun,
  onWarn,
  report,
  targetLabel,
}: {
  disabled: boolean
  onBanEvasionAction?: (reportId: string) => void
  onResolve: (reportId: string, status: 'reviewed' | 'dismissed') => void
  onRerun: (reportId: string) => void
  onWarn?: (reportId: string) => void
  report: AdminModerationReport
  targetLabel: string
}) {
  const t = useTranslations()
  const rerunLabel = t('extracted.admin.adminReportRow.reRunJudgement_8b575390')
  const ordinaryPending = isOrdinaryPendingReport(report)

  return (
    <td className='px-6 py-4'>
      <div className='flex flex-wrap gap-2'>
        {report.status === 'pending' ? (
          <>
            {ordinaryPending ? (
              <>
                <Button
                  data-pw='admin-report-row-reviewed'
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
                  data-pw='admin-report-row-dismiss'
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
          data-pw='admin-report-row-rerun-ai-judgement'
          size='touchSm'
          variant='outline'
          disabled={disabled}
          aria-label={accessibleNameWithVisibleText(
            rerunLabel,
            t('extracted.admin.adminReportRow.reRunAiJudgementForTargetlabel_793a29ff', {
              targetLabel,
            }),
          )}
          onClick={() => onRerun(report.id)}
        >
          <RefreshCw className='size-4' />
          {rerunLabel}
        </Button>
      </div>
    </td>
  )
}
