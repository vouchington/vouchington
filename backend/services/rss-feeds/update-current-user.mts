import { invalidate } from '@services/entity-cache/invalidate'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanUpdateRssFeed } from './authorization.mts'
import {
  beginTransaction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  setRssFeedDiscoverabilityAsCurrentUser,
  setRssFeedEnablementAsCurrentUser,
} from './discoverability.mts'
import { updateRssFeedById, type UpdateRssFeedChanges } from './update.mts'
import { omitStateChanges, type RssFeedStateChange } from './update-state-helpers.mts'
import { enqueueEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'

export const updateRssFeedByIdAsCurrentUser = async (
  currentUser: PrivateUser,
  id: string,
  changes: UpdateRssFeedChanges,
  options?: QueryOptions,
): Promise<string | null> => {
  assert(currentUserCanUpdateRssFeed(currentUser), 403, 'Forbidden')
  const stateChanges: RssFeedStateChange[] = []
  if (changes.enabled !== undefined) {
    stateChanges.push({ kind: 'enablement', enabled: changes.enabled })
  }
  if (changes.discoverable !== undefined) {
    stateChanges.push({ kind: 'discoverability', enabled: changes.discoverable })
  }

  const fieldChanges = omitStateChanges(changes)
  const hasFieldChanges = Object.keys(fieldChanges).length > 0
  if (!hasFieldChanges && stateChanges.length === 0) return null
  let eligibilityChanged = false

  const transactionOptions = options ?? {}
  const run = async (query: TransactionQuery) => {
    const txOptions = { query }
    if (hasFieldChanges) {
      const updatedFieldId = await updateRssFeedById(id, fieldChanges, txOptions)
      if (!updatedFieldId) return null
    } else {
      const existing = await query(
        sql`/* updateRssFeedByIdAsCurrentUser:lock */ SELECT id FROM rss_feeds WHERE id = ${id} FOR UPDATE`,
      )
      if (existing.rows.length === 0) return null
    }
    const stateChange = stateChanges.find(({ kind }) => kind === 'enablement')
    if (stateChange) {
      const result = await setRssFeedEnablementAsCurrentUser(
        currentUser,
        {
          rssFeedId: id,
          enabled: stateChange.enabled,
          reason: 'user update helper',
        },
        txOptions,
      )
      eligibilityChanged ||= result === 'updated'
    }

    const discoverabilityChange = stateChanges.find(({ kind }) => kind === 'discoverability')
    if (discoverabilityChange) {
      const result = await setRssFeedDiscoverabilityAsCurrentUser(
        currentUser,
        {
          rssFeedId: id,
          enabled: discoverabilityChange.enabled,
          reason: 'user update helper',
        },
        txOptions,
      )
      eligibilityChanged ||= result === 'updated'
    }
    return id
  }
  const updatedId = await runInTransaction(transactionOptions, run)
  if (!options?.query && !options?.client) await invalidate.rss_feeds(id)
  if (updatedId && fieldChanges.topic_id !== undefined && !options?.query && !options?.client) {
    /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
    void enqueueEvaluateRssFeedDiscoverability(id)
  }
  if (updatedId && eligibilityChanged && !options?.query && !options?.client)
    void enqueueRefreshTopHashtags()
  return updatedId as string | null
}

export async function updateRssFeedWithStateAsCurrentUser(
  currentUser: PrivateUser,
  id: string,
  changes: UpdateRssFeedChanges,
  stateChanges: {
    enabled?: boolean
    discoverable?: boolean
    reason?: string | null
  },
): Promise<void> {
  assert(currentUserCanUpdateRssFeed(currentUser), 403, 'Forbidden')
  const fieldChanges = omitStateChanges(changes)
  let eligibilityChanged = false
  const run = async (query: TransactionQuery) => {
    const options = { query }

    const fieldChangeCount = Object.keys(fieldChanges).length
    if (fieldChangeCount > 0) {
      const updatedFieldId = await updateRssFeedById(id, fieldChanges, options)
      if (!updatedFieldId) return false
    } else {
      const existing = await query(
        sql`/* updateRssFeedWithStateAsCurrentUser:lock */ SELECT id FROM rss_feeds WHERE id = ${id} FOR UPDATE`,
      )
      if (existing.rows.length === 0) return false
    }

    if (stateChanges.enabled !== undefined) {
      const result = await setRssFeedEnablementAsCurrentUser(
        currentUser,
        {
          rssFeedId: id,
          enabled: stateChanges.enabled,
          reason: stateChanges.reason,
        },
        options,
      )
      eligibilityChanged ||= result === 'updated'
    }
    if (stateChanges.discoverable !== undefined) {
      const result = await setRssFeedDiscoverabilityAsCurrentUser(
        currentUser,
        {
          rssFeedId: id,
          enabled: stateChanges.discoverable,
          reason: stateChanges.reason,
        },
        options,
      )
      eligibilityChanged ||= result === 'updated'
    }
    return true
  }
  const updated = await runInTransaction({}, run)
  if (updated) await invalidate.rss_feeds(id)
  if (updated && fieldChanges.topic_id !== undefined) void enqueueEvaluateRssFeedDiscoverability(id)
  if (updated && eligibilityChanged) void enqueueRefreshTopHashtags()
}

async function runInTransaction<Result>(
  options: QueryOptions,
  run: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
