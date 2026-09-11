'use client'

import { Button } from '@/components/ui/button'
import type { ReportIntegrityFlag } from '@/types/report-integrity'
import type { ReportIntegrityFlagsState } from './use-report-integrity-flags'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReportIntegrityFlagActionProps {
  flag: ReportIntegrityFlag
  state: Pick<
    ReportIntegrityFlagsState,
    | 'actionLoading'
    | 'applyPenaltyWithConfirmation'
    | 'handleResolve'
    | 'penaltyConfirm'
    | 'penaltyResults'
    | 'resolutions'
  >
}

export function ResolveReportIntegrityFlagButton({ flag, state }: ReportIntegrityFlagActionProps) {
  const t = useTranslations()
  return (
    <Button
      size='sm'
      variant='outline'
      loading={state.actionLoading[flag.id]}
      disabled={!state.resolutions[flag.id] || state.actionLoading[flag.id]}
      onClick={() => state.handleResolve(flag.id)}
      data-pw='report-integrity-resolve'
    >
      {t('extracted.flags.reportIntegrityFlagActions.resolve_c8f193b3')}
    </Button>
  )
}

export function PenalizeReportersButton({ flag, state }: ReportIntegrityFlagActionProps) {
  const t = useTranslations()
  return (
    <Button
      size='sm'
      variant='outline'
      loading={state.actionLoading[flag.id]}
      disabled={state.actionLoading[flag.id] || state.penaltyResults[flag.id] !== undefined}
      onClick={() => state.applyPenaltyWithConfirmation(flag.id)}
      title={t(
        'extracted.flags.reportIntegrityFlagActions.applyPenaltiesToReportersAbusingThe_70fe36bb',
      )}
      data-pw='report-integrity-investigate'
    >
      {state.penaltyResults[flag.id] !== undefined
        ? t('extracted.flags.reportIntegrityFlagActions.countPenalized_8293a4b5', {
            count: state.penaltyResults[flag.id],
          })
        : state.penaltyConfirm[flag.id]
          ? t('extracted.flags.reportIntegrityFlagActions.confirm_93a4b5c6')
          : t('extracted.flags.reportIntegrityFlagActions.penalizeReporters_a4b5c6d7')}
    </Button>
  )
}
