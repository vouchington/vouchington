import { invalidate } from '@services/entity-cache/invalidate'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanUpdateRssFeed } from './authorization.mts'
import type { TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { setRssFeedStatesAsCurrentUser } from './set-states-as-current-user.mts'
import type { ViewRssFeed } from './types.mts'
import { updateRssFeedById, type UpdateRssFeedChanges } from './update.mts'
import { omitStateChanges } from './update-state-helpers.mts'
import { enqueueEvaluateRssFeedDiscoverability } from '@queues/rss-feed-maintenance/enqueues/discoverability'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { runRssFeedStateTransaction } from './state-transaction.mts'

export async function updateRssFeedWithStateAsCurrentUser(
  currentUser: PrivateUser,
  id: string,
  changes: UpdateRssFeedChanges,
  stateChanges: {
    is_enabled?: boolean
    discoverable?: boolean
    reason?: string | null
  },
): Promise<ViewRssFeed | null> {
  assert(currentUserCanUpdateRssFeed(currentUser), 403, 'Forbidden')
  const fieldChanges = omitStateChanges(changes)
  let eligibilityChanged = false
  const run = async (query: TransactionQuery): Promise<ViewRssFeed | null> => {
    const options = { query }

    const fieldChangeCount = Object.keys(fieldChanges).length
    if (fieldChangeCount > 0) {
      const updatedFieldId = await updateRssFeedById(id, fieldChanges, options)
      if (!updatedFieldId) return null
    } else {
      const existing = await query(
        sql`/* updateRssFeedWithStateAsCurrentUser:lock */ SELECT id FROM rss_feeds WHERE id = ${id} FOR UPDATE`,
      )
      if (existing.rows.length === 0) return null
    }

    const result = await setRssFeedStatesAsCurrentUser(
      currentUser,
      id,
      [
        ...(stateChanges.is_enabled === undefined
          ? []
          : [
              {
                kind: 'enablement' as const,
                is_enabled: stateChanges.is_enabled,
                reason: stateChanges.reason,
              },
            ]),
        ...(stateChanges.discoverable === undefined
          ? []
          : [
              {
                kind: 'discoverability' as const,
                is_enabled: stateChanges.discoverable,
                reason: stateChanges.reason,
              },
            ]),
      ],
      options,
    )
    eligibilityChanged ||= result === 'updated'
    // The write transaction returns the fresh row so the route does not re-read after commit.
    const fresh = await query(
      sql`/* updateRssFeedWithStateAsCurrentUser:fresh */ SELECT * FROM view_rss_feeds WHERE id = ${id}`,
    )
    return (fresh.rows[0] as ViewRssFeed | undefined) ?? null
  }
  const updated = await runRssFeedStateTransaction({}, run)
  if (updated) await invalidate.rss_feeds(id)
  if (updated && fieldChanges.topic_id !== undefined) void enqueueEvaluateRssFeedDiscoverability(id)
  if (updated && eligibilityChanged) void enqueueRefreshTopHashtags()
  return updated
}
