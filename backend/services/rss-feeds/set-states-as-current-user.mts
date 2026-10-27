import type { PrivateUser } from '@services/users/types'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import {
  currentUserCanModifyRssFeedDiscoverability,
  currentUserCanModifyRssFeedEnablement,
} from './authorization.mts'
import { recordRssFeedStatePublicationChange } from './publication-change.mts'
import { lockPostPublicationScope } from '@services/post-publication/lock'
import { applyCommittedRssFeedStateChangeEffects } from './state-effects.mts'
import { runRssFeedStateTransaction } from './state-transaction.mts'
import {
  insertRssFeedStateChanges,
  lockLatestRssFeedStates,
  type RssFeedStateInsert,
} from './state-changes.mts'

export type SetStatesResult = 'updated' | 'noop'

function currentUserCanModify(currentUser: PrivateUser, change: RssFeedStateInsert): boolean {
  return change.kind === 'discoverability'
    ? currentUserCanModifyRssFeedDiscoverability(currentUser)
    : currentUserCanModifyRssFeedEnablement(currentUser)
}

/**
 * Applies one decision per kind to a feed under one publication-scope lock: the latest decision of
 * every kind is read once, and the kinds whose value differs are appended together. A kind that
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
    await lockPostPublicationScope(query, { type: 'rss_feed', rssFeedId })
    const latest = await lockLatestRssFeedStates(
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
      // oxlint-disable-next-line no-await-in-loop -- one publication change per kind, in request order
      await recordRssFeedStatePublicationChange(query, rssFeedId, update.kind)
    }
    return 'updated'
  }
  const result = await runRssFeedStateTransaction(options, run)
  await applyCommittedRssFeedStateChangeEffects(rssFeedId, result === 'updated', options)
  return result
}
