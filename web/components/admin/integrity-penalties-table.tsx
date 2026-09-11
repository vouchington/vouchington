'use client'

import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { useTranslations } from '@/lib/i18n/use-translations'
import type {
  IntegrityPenaltiesState,
  IntegrityPenaltyRecord,
  IntegrityPenaltyStatus,
} from './use-integrity-penalties'
import { IntegrityPenaltyRow } from './integrity-penalty-row'

interface IntegrityPenaltiesTableProps<P extends IntegrityPenaltyRecord> {
  domain: 'report' | 'vote'
  initialStatus: IntegrityPenaltyStatus
  multiplier: (penalty: P) => string | null
  state: IntegrityPenaltiesState<P>
}

const COLUMN_KEYS = [
  ['user', 'extracted.flags.integrityPenalties.user_77edb64f'],
  ['reason', 'extracted.flags.integrityPenalties.reason_9c1c2ea8'],
  ['multiplier', 'extracted.flags.integrityPenalties.multiplier_d4a93718'],
  ['sourceFlag', 'extracted.flags.integrityPenalties.sourceFlag_5d031eef'],
  ['created', 'extracted.flags.integrityPenalties.created_d70b9e24'],
  ['state', 'extracted.flags.integrityPenalties.state_6c2a779f'],
  ['actions', 'extracted.flags.integrityPenalties.actions_ff8059dc'],
] as const

export function IntegrityPenaltiesTable<P extends IntegrityPenaltyRecord>(
  props: IntegrityPenaltiesTableProps<P>,
) {
  const t = useTranslations()
  const handleLoadMore = props.state.loadMore
  const columns = COLUMN_KEYS.reduce<(typeof COLUMN_KEYS)[number][]>((visible, column) => {
    if (props.domain === 'vote' || column[0] !== 'multiplier') visible.push(column)
    return visible
  }, [])
  return (
    <InfiniteScroll
      hasNextPage={
        props.state.scopeAvailable &&
        !props.state.isPending &&
        !props.state.fetchError &&
        props.state.hasNextPage
      }
      endCursor={props.state.endCursor}
      onLoadMore={handleLoadMore}
      resetKey={props.state.pages[0]}
    >
      <AdminTableShell
        aria-label={
          props.domain === 'report'
            ? t('extracted.flags.integrityPenalties.reportTitle_6f7f2d01')
            : t('extracted.flags.integrityPenalties.voteTitle_3a621e8c')
        }
        isEmpty={props.state.penalties.length === 0}
        emptyMessage={t('extracted.flags.integrityPenalties.noPenalties_02b8865c')}
      >
        <table className='w-full'>
          <thead className='border-b bg-muted/50'>
            <tr>
              {columns.map(([key, messageKey]) => (
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
          <tbody className='divide-y'>
            {props.state.penalties.map(penalty => (
              <IntegrityPenaltyRow
                key={penalty.id}
                domain={props.domain}
                initialStatus={props.initialStatus}
                multiplier={props.multiplier(penalty)}
                penalty={penalty}
                reconciliationTestId={
                  props.domain === 'vote'
                    ? 'vote-integrity-penalty-reconciliation'
                    : 'report-integrity-penalty-reconciliation'
                }
                revokeTestId={
                  props.domain === 'vote'
                    ? 'vote-integrity-penalty-revoke'
                    : 'report-integrity-penalty-revoke'
                }
                state={props.state}
              />
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </InfiniteScroll>
  )
}
