'use client'

import {
  IntegrityFlagResolvedActor,
  IntegrityFlagUnresolvedActions,
} from '@/components/admin/integrity-flag-action-row'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { FlagResolution, ReportIntegrityFlag } from '@/types/report-integrity'
import { formatUtcDate } from '@ts-shared/utils/format'
import { EntityLink } from './report-integrity-entity-link'
import {
  PenalizeReportersButton,
  ResolveReportIntegrityFlagButton,
} from './report-integrity-flag-actions'
import { ReportIntegrityFlagStatus } from './report-integrity-flag-status'
import type { ReportIntegrityFlagsTableProps } from './report-integrity-flags-table-props'

type FlagRowProps = {
  flag: ReportIntegrityFlag
  state: ReportIntegrityFlagsTableProps
}

export function ReportIntegrityFlagRow({ flag, state }: FlagRowProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <tr
      className='hover:bg-muted/50'
      data-report-integrity-flag-id={flag.id}
    >
      <td className='px-4 py-4 text-sm text-foreground'>
        {t('extracted.flags.integrityActions.massReportSuspected_cc227ce2')}
      </td>
      <td className='max-w-72 px-4 py-4 text-xs text-muted-foreground'>
        {JSON.stringify(flag.details)}
      </td>
      <td className='px-4 py-4 font-mono text-sm text-muted-foreground'>
        <EntityLink flag={flag} />
      </td>
      <td className='px-4 py-4 text-sm text-foreground'>{flag.reporter_count}</td>
      <td className='px-4 py-4 text-sm text-foreground'>
        {t('extracted.flags.reportIntegrityFlagsTable.pct_76b8d2be', {
          pct: (flag.new_account_reporter_pct * 100).toFixed(1),
        })}
      </td>
      <td
        className='whitespace-nowrap px-4 py-4 text-sm text-muted-foreground'
        suppressHydrationWarning
      >
        {formatUtcDate(flag.created_at, uiLocale)}
      </td>
      <td className='px-4 py-4 text-sm'>
        <ReportIntegrityFlagStatus flag={flag} />
      </td>
      <td className='px-4 py-4 text-sm'>
        <ReportIntegrityFlagActions
          flag={flag}
          state={state}
        />
      </td>
    </tr>
  )
}

function ReportIntegrityFlagActions({ flag, state }: FlagRowProps) {
  if (flag.resolved_at) {
    return (
      <IntegrityFlagResolvedActor
        resolvedAt={flag.resolved_at}
        resolvedById={flag.resolved_by_id}
      />
    )
  }
  return (
    <IntegrityFlagUnresolvedActions
      domain='report'
      resolution={state.resolutions[flag.id] ?? ''}
      onResolutionChange={value => state.updateResolution(flag.id, value as FlagResolution)}
      actions={
        <>
          <ResolveReportIntegrityFlagButton
            flag={flag}
            state={state}
          />
          <PenalizeReportersButton
            flag={flag}
            state={state}
          />
        </>
      }
      error={state.actionErrors[flag.id]}
      reconciliationRequired={state.reconciliationRequired[flag.id]}
      onRetryReconciliation={() => {
        void state.retryReconciliation(flag.id)
      }}
    />
  )
}
