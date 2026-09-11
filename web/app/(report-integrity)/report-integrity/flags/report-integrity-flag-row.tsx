'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { userHref } from '@/lib/links/entity-href'
import type { FlagResolution, ReportIntegrityFlag } from '@/types/report-integrity'
import { formatUtcDate } from '@ts-shared/utils/format'
import { EntityLink } from './report-integrity-entity-link'
import {
  PenalizeReportersButton,
  ResolveReportIntegrityFlagButton,
} from './report-integrity-flag-actions'
import { ReportIntegrityFlagStatus } from './report-integrity-flag-status'
import type { ReportIntegrityFlagsTableProps } from './report-integrity-flags-table'

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
  const t = useTranslations()
  if (flag.resolved_at) {
    return (
      <div className='text-xs text-muted-foreground'>
        <time dateTime={flag.resolved_at}>{formatUtcDate(flag.resolved_at)}</time>
        {flag.resolved_by_id ? (
          <Link
            href={userHref({ id: flag.resolved_by_id })}
            prefetch={false}
            className='block font-mono text-link hover:underline'
          >
            {t('extracted.flags.integrityPenalties.byActor_3cba3612', {
              actor: flag.resolved_by_id,
            })}
          </Link>
        ) : null}
      </div>
    )
  }
  return (
    <div>
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          value={state.resolutions[flag.id] ?? ''}
          onValueChange={value => state.updateResolution(flag.id, value as FlagResolution)}
        >
          <SelectTrigger
            className='h-8 w-36 text-xs'
            aria-label={t('extracted.flags.reportIntegrityFlagsTable.resolution_d4055faf')}
            data-pw='report-integrity-resolution-select'
          >
            <SelectValue
              placeholder={t('extracted.flags.reportIntegrityFlagsTable.resolution_3da993e6')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='dismissed'>
              {t('extracted.flags.reportIntegrityFlagsTable.dismiss_48845bff')}
            </SelectItem>
          </SelectContent>
        </Select>
        <ResolveReportIntegrityFlagButton
          flag={flag}
          state={state}
        />
        <PenalizeReportersButton
          flag={flag}
          state={state}
        />
      </div>
      <FlagActionFeedback
        flag={flag}
        state={state}
      />
    </div>
  )
}

function FlagActionFeedback({ flag, state }: FlagRowProps) {
  const t = useTranslations()
  if (!state.actionErrors[flag.id] && !state.reconciliationRequired[flag.id]) return null
  return (
    <div className='mt-2 text-xs text-destructive'>
      <p>{state.actionErrors[flag.id]}</p>
      {state.reconciliationRequired[flag.id] ? (
        <div data-pw='report-integrity-flag-reconciliation'>
          <Button
            size='touchSm'
            variant='outline'
            onClick={() => {
              void state.retryReconciliation(flag.id)
            }}
          >
            {t('extracted.flags.integrityPenalties.reconcile_75147bb1')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
