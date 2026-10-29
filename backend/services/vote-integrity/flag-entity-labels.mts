import { read, type QueryExecutor } from '@data-stores/psql'
import { attachVoteIntegrityFlagLabels, type VoteFlagLabels } from '@services/integrity-labels'
import type { VoteIntegrityFlag } from './create-flag.mts'

export function attachVoteFlagEntityLabels<T extends VoteIntegrityFlag>(
  flags: T[],
  query: QueryExecutor = read,
): Promise<Array<T & VoteFlagLabels>> {
  return attachVoteIntegrityFlagLabels(flags, query)
}
