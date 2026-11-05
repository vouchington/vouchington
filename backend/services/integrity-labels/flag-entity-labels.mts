import { read, type QueryExecutor } from '@data-stores/psql'
import { attachIntegrityLabelRows } from './attach-label-rows.mts'
import { flagLabelQuery } from './flag-label-query.mts'

type FlagIdentity = { id: string; flag_type: string }

type FlagLabelRow = {
  id: string
  entity_label: string
  resolver_username: string | null
  resolver_display_name: string | null
  reported_username: string | null
}

export type VoteFlagLabels = Pick<
  FlagLabelRow,
  'entity_label' | 'resolver_username' | 'resolver_display_name'
>
export type ReportFlagLabels = VoteFlagLabels & Pick<FlagLabelRow, 'reported_username'>

const voteFacts = (fact: FlagLabelRow | undefined, flag: FlagIdentity): VoteFlagLabels => ({
  entity_label: fact?.entity_label ?? flag.flag_type,
  resolver_username: fact?.resolver_username ?? null,
  resolver_display_name: fact?.resolver_display_name ?? null,
})

export function attachReportIntegrityFlagLabels<T extends FlagIdentity>(
  flags: T[],
  query: QueryExecutor = read,
): Promise<Array<T & ReportFlagLabels>> {
  return attachIntegrityLabelRows<T, FlagLabelRow, ReportFlagLabels>(
    flags,
    ids => flagLabelQuery('report', ids),
    (fact, flag) => ({
      ...voteFacts(fact, flag),
      reported_username: fact?.reported_username ?? null,
    }),
    query,
  )
}

export function attachVoteIntegrityFlagLabels<T extends FlagIdentity>(
  flags: T[],
  query: QueryExecutor = read,
): Promise<Array<T & VoteFlagLabels>> {
  return attachIntegrityLabelRows<T, FlagLabelRow, VoteFlagLabels>(
    flags,
    ids => flagLabelQuery('vote', ids),
    voteFacts,
    query,
  )
}
