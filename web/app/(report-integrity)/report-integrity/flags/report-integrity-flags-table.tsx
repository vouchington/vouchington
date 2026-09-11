'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import type { StatusFilter } from '@/types/report-integrity'
import type { ReportIntegrityFlagsState } from './use-report-integrity-flags'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ReportIntegrityFlagRow } from './report-integrity-flag-row'

export type ReportIntegrityFlagsTableProps = Pick<
  ReportIntegrityFlagsState,
  | 'actionLoading'
  | 'actionErrors'
  | 'applyPenaltyWithConfirmation'
  | 'endCursor'
  | 'clearError'
  | 'fetchError'
  | 'flags'
  | 'handleLoadMore'
  | 'handleResolve'
  | 'hasNextPage'
  | 'isPending'
  | 'loadingMore'
  | 'penaltyConfirm'
  | 'penaltyResults'
  | 'resetKey'
  | 'resolutions'
  | 'reconciliationRequired'
  | 'retryReconciliation'
  | 'updateResolution'
> & {
  initialStatus: StatusFilter
}

export function ReportIntegrityFlagsTable(props: ReportIntegrityFlagsTableProps) {
  const t = useTranslations()
  return (
    <InfiniteScroll
      hasNextPage={!props.isPending && props.hasNextPage}
      endCursor={props.endCursor}
      onLoadMore={props.handleLoadMore}
      loadingMore={props.loadingMore}
      fetchError={props.fetchError}
      clearError={props.clearError}
      resetKey={props.resetKey}
    >
      <div className='overflow-hidden rounded-lg bg-card shadow-sm dark:shadow-none'>
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <ReportIntegrityFlagsTableHead />
            <tbody className='divide-y'>
              {props.flags.map(flag => (
                <ReportIntegrityFlagRow
                  key={flag.id}
                  flag={flag}
                  state={props}
                />
              ))}
            </tbody>
          </table>
        </div>
        {props.flags.length === 0 && (
          <div className='p-12 text-center'>
            <p className='text-muted-foreground'>
              {t('extracted.flags.reportIntegrityFlagsTable.noStatusFlagsFound_b50a0a53', {
                status: props.initialStatus !== 'all' ? props.initialStatus : '',
              })}
            </p>
          </div>
        )}
      </div>
    </InfiniteScroll>
  )
}

const FLAGS_TABLE_COLUMNS = [
  ['flagType', 'extracted.flags.reportIntegrityFlagsTable.flagType_5a1e2c90'],
  ['evidence', 'extracted.flags.integrityActions.evidence_f874c9e1'],
  ['target', 'extracted.flags.reportIntegrityFlagsTable.target_7c3f9d21'],
  ['reporters', 'extracted.flags.reportIntegrityFlagsTable.reporters_9b2a4e63'],
  ['newAccountPct', 'extracted.flags.reportIntegrityFlagsTable.newAccountPercent_1d4f6a85'],
  ['created', 'extracted.flags.reportIntegrityFlagsTable.created_d70b9e24'],
  ['status', 'extracted.flags.reportIntegrityFlagsTable.status_920e413c'],
  ['actions', 'extracted.flags.reportIntegrityFlagsTable.actions_ff8059dc'],
] as const

function ReportIntegrityFlagsTableHead() {
  const t = useTranslations()
  return (
    <thead className='border-b bg-muted/50'>
      <tr>
        {FLAGS_TABLE_COLUMNS.map(([key, messageKey]) => (
          <th
            key={key}
            scope='col'
            className='px-4 py-3 text-left text-sm font-medium text-foreground'
          >
            {t(messageKey)}
          </th>
        ))}
      </tr>
    </thead>
  )
}
