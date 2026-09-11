'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import type { StatusFilter, VoteIntegrityFlag } from '@/types/vote-integrity'
import { VoteIntegrityFlagStatus } from './vote-integrity-flag-status'
import type { VoteIntegrityFlagsState } from './use-vote-integrity-flags'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getEntityLabel } from './vote-integrity-entity-label'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatUtcDate } from '@ts-shared/utils/format'
import { VoteIntegrityFlagActions } from './vote-integrity-flag-row-actions'

export type VoteIntegrityFlagsTableProps = Pick<
  VoteIntegrityFlagsState,
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
  | 'penaltyApplied'
  | 'resetKey'
  | 'penaltyConfirm'
  | 'penaltyResults'
  | 'resolutions'
  | 'reconciliationRequired'
  | 'retryReconciliation'
  | 'updateResolution'
> & {
  initialStatus: StatusFilter
}

export function VoteIntegrityFlagsTable(props: VoteIntegrityFlagsTableProps) {
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
            <VoteIntegrityFlagsTableHead />
            <tbody className='divide-y'>
              {props.flags.map(flag => (
                <VoteIntegrityFlagRow
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
              {t('extracted.flags.voteIntegrityFlagsTable.noStatusFlagsFound_b50a0a53', {
                status: props.initialStatus !== 'all' ? props.initialStatus : '',
              })}
            </p>
          </div>
        )}
      </div>
    </InfiniteScroll>
  )
}

function VoteIntegrityFlagsTableHead() {
  const t = useTranslations()
  const columns = [
    t('extracted.flags.voteIntegrityFlagsTable.flagType_3b8e9c40'),
    t('extracted.flags.integrityActions.evidence_f874c9e1'),
    t('extracted.flags.voteIntegrityFlagsTable.entity_7d2a5f61'),
    t('extracted.flags.voteIntegrityFlagsTable.created_1c9b4e82'),
    t('extracted.flags.voteIntegrityFlagsTable.status_6a3d8f03'),
    t('extracted.flags.voteIntegrityFlagsTable.actions_9e4c2b74'),
  ]
  return (
    <thead className='border-b bg-muted/50'>
      <tr>
        {columns.map(column => (
          <th
            key={column}
            scope='col'
            className='px-4 py-3 text-left text-sm font-medium text-foreground'
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function VoteIntegrityFlagRow({
  flag,
  state,
}: {
  flag: VoteIntegrityFlag
  state: VoteIntegrityFlagsTableProps
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const reason =
    flag.flag_type === 'velocity_spike'
      ? t('extracted.flags.integrityActions.velocitySpike_5be6d539')
      : t('extracted.flags.integrityActions.ipCorrelation_a7083d7c')
  const evidence = JSON.stringify(flag.details)
  return (
    <tr
      className='hover:bg-muted/50'
      data-flag-id={flag.id}
    >
      <td className='px-4 py-4 text-sm text-foreground'>
        <span>{reason}</span>
      </td>
      <td className='max-w-72 px-4 py-4 text-xs text-muted-foreground'>{evidence}</td>
      <td className='px-4 py-4 font-mono text-sm text-muted-foreground'>
        {getEntityLabel(flag, t)}
      </td>
      <td
        className='whitespace-nowrap px-4 py-4 text-sm text-muted-foreground'
        suppressHydrationWarning
      >
        {formatUtcDate(flag.created_at, uiLocale)}
      </td>
      <td className='px-4 py-4 text-sm'>
        <VoteIntegrityFlagStatus flag={flag} />
      </td>
      <td className='px-4 py-4 text-sm'>
        <VoteIntegrityFlagActions
          flag={flag}
          state={state}
        />
      </td>
    </tr>
  )
}
