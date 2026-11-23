import type { PrivateUser } from '@services/users/types'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import {
  currentUserCanModifyRssFeedDiscoverability,
  currentUserCanModifyRssFeedEnablement,
} from './authorization.mts'
import { recordRssFeedStatePublicationChange } from './publication-change.mts'
import { applyCommittedRssFeedStateChangeEffects } from './state-effects.mts'
import { runRssFeedStateTransaction } from './state-transaction.mts'
import {
  insertRssFeedStateChanges,
  readLatestRssFeedStates,
  type RssFeedStateInsert,
} from './state-changes.mts'

export type SetStatesResult = 'updated' | 'noop'

function currentUserCanModify(currentUser: PrivateUser, change: RssFeedStateInsert): boolean {
  return change.kind === 'discoverability'
    ? currentUserCanModifyRssFeedDiscoverability(currentUser)
    : currentUserCanModifyRssFeedEnablement(currentUser)
}

/**
 * Reads each requested kind once and appends the kinds whose value differs together. A kind that
 * already has the requested value is left alone. Kinds must be distinct.
 */
export async function setRssFeedStatesAsCurrentUser(
  currentUser: PrivateUser,
  rssFeedId: string,
  changes: readonly RssFeedStateInsert[],
  options: QueryOptions = {},
): Promise<SetStatesResult> {
  if (changes.length === 0) return 'noop'
  for (const change of changes) assert(currentUserCanModify(currentUser, change), 403, 'Forbidden')
  const run = async (query: TransactionQuery): Promise<SetStatesResult> => {
    const latest = await readLatestRssFeedStates(
      query,
      rssFeedId,
      changes.map(change => change.kind),
    )
    const updates = changes.filter(
      change => latest.get(change.kind)?.is_enabled !== change.is_enabled,
    )
    if (updates.length === 0) return 'noop'
    await insertRssFeedStateChanges(rssFeedId, updates, currentUser.id, { query })
    for (const update of updates) {
      recordRssFeedStatePublicationChange(query, rssFeedId, update, latest.get(update.kind)?.id)
    }
    return 'updated'
  }
  const result = await runRssFeedStateTransaction(options, run)
  await applyCommittedRssFeedStateChangeEffects(rssFeedId, result === 'updated', options)
  return result
}
