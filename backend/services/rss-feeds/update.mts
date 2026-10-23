import { invalidate } from '@services/entity-cache/invalidate'
import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import {
  setRssFeedDiscoverabilityAsSystem,
  setRssFeedEnablementAsSystem,
} from './discoverability.mts'
import { enqueueEvaluateRssFeedDiscoverability } from '@queues/rss-feed-maintenance/enqueues/discoverability'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { buildRssFeedUpdateFields } from './update-fields.mts'
import { recordRssFeedDiscoverabilityPublicationChange } from './publication-change.mts'
import { assertTopicHasHostname } from '@services/topics/hostname-link'
import {
  lockPostPublicationScope,
  lockTopicRssFeedAttachmentLifecycles,
} from '@services/post-publication/lock'

import type { UpdateRssFeedChanges, UpdateRssFeedOptions } from './update-types.mts'
export type { UpdateRssFeedChanges, UpdateRssFeedOptions } from './update-types.mts'

export const updateRssFeedById = async (
  id: string,
  changes: UpdateRssFeedChanges,
  options: UpdateRssFeedOptions = {},
) => {
  const { sets, stateChanges } = await buildRssFeedUpdateFields(changes, options)
  const stateChangeReason = options.stateChangeReason ?? 'rss feed update helper'

  if (sets.length === 0 && stateChanges.length === 0) return null

  const updateQuery = sql`/* updateRssFeedById */ UPDATE rss_feeds SET `
  sets.forEach((set, index) => {
    if (index > 0) updateQuery.append(sql`, `)
    updateQuery.append(set)
  })
  updateQuery.append(sql` WHERE id = ${id} RETURNING id`)

  const transactionOptions = options ?? {}
  const run = async (query: TransactionQuery) => {
    let priorTopicId: string | null = null
    if (changes.topic_id !== undefined) {
      const prior = await query<{ topic_id: string | null }>(
        sql`/* updateRssFeedById:priorTopic */ SELECT topic_id FROM rss_feeds WHERE id = ${id}`,
      )
      priorTopicId = prior.rows[0]?.topic_id ?? null
      await lockTopicRssFeedAttachmentLifecycles(
        query,
        [priorTopicId, changes.topic_id].filter((topicId): topicId is string => topicId !== null),
      )
      await assertTopicHasHostname(changes.topic_id, { query })
    }
    await lockPostPublicationScope(query, { type: 'rss_feed', rssFeedId: id })
    const existing = await query<{ id: string; topic_id: string }>(
      sql`/* updateRssFeedById:lock */ SELECT id, topic_id FROM rss_feeds WHERE id = ${id} FOR UPDATE`,
    )
    if (existing.rows.length === 0) return null
    const previousTopicId = existing.rows[0]!.topic_id
    if (
      changes.topic_id !== undefined &&
      previousTopicId !== priorTopicId &&
      previousTopicId !== changes.topic_id
    )
      throw createHttpError(409, 'RSS feed topic changed while acquiring attachment fences')

    const stateChange = stateChanges.find(({ kind }) => kind === 'enablement')
    if (stateChange) {
      await setRssFeedEnablementAsSystem(
        {
          rssFeedId: id,
          is_enabled: stateChange.is_enabled,
          reason: stateChangeReason,
        },
        { query },
      )
    }

    const discoverabilityChange = stateChanges.find(({ kind }) => kind === 'discoverability')
    if (discoverabilityChange) {
      await setRssFeedDiscoverabilityAsSystem(
        {
          rssFeedId: id,
          is_enabled: discoverabilityChange.is_enabled,
          reason: stateChangeReason,
        },
        { query },
      )
    }
    if (sets.length === 0) return id
    const { rows } = await query(updateQuery)
    const result = rows[0]?.id || null
    if (result && changes.topic_id !== undefined && changes.topic_id !== previousTopicId) {
      await recordRssFeedDiscoverabilityPublicationChange(
        query,
        id,
        'rss_feed_discoverability_changed',
        [previousTopicId, changes.topic_id],
      )
    }
    return result
  }
  const updatedId = await runInTransaction(transactionOptions, run)
  if (!options.query && !options.client) await invalidate.rss_feeds(id)
  if (updatedId && changes.topic_id !== undefined && !options.query && !options.client) {
    void enqueueEvaluateRssFeedDiscoverability(id)
  }
  if (updatedId && !options.query && !options.client) void enqueueRefreshTopHashtags()
  return updatedId as string | null
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
