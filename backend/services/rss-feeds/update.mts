import { invalidate } from '@services/entity-cache/invalidate'
import {
  beginTransaction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  setRssFeedDiscoverabilityAsSystem,
  setRssFeedEnablementAsSystem,
} from './discoverability.mts'
import { enqueueEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { buildRssFeedUpdateFields } from './update-fields.mts'
import { recordRssFeedDiscoverabilityPublicationChange } from './publication-change.mts'
import { assertTopicHasHostname } from '@services/topics/hostname-link'
import {
  lockPostPublicationScope,
  lockTopicRssFeedAttachmentLifecycle,
} from '@services/post-publication/lock'

export type UpdateRssFeedChanges = {
  rss_feed_url?: string
  topic_id?: string
  title?: string | null
  enabled?: boolean
  discoverable?: boolean
  etag?: string | null
  last_modified_at?: Date | true | null
  last_fetched_at?: Date | true
  feed_type?: 'article' | 'podcast' | 'video' | 'mixed'
  declared_language?: string | null
  ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}

export type UpdateRssFeedOptions = QueryOptions & {
  stateChangeReason?: string
  preserveHttp?: boolean
}

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
    if (changes.topic_id !== undefined) {
      await lockTopicRssFeedAttachmentLifecycle(query, changes.topic_id)
      await assertTopicHasHostname(changes.topic_id, { query })
    }
    await lockPostPublicationScope(query, { type: 'rss_feed', rssFeedId: id })
    const existing = await query<{ id: string; topic_id: string }>(
      sql`/* updateRssFeedById:lock */ SELECT id, topic_id FROM rss_feeds WHERE id = ${id} FOR UPDATE`,
    )
    if (existing.rows.length === 0) return null
    const previousTopicId = existing.rows[0]!.topic_id

    const stateChange = stateChanges.find(({ kind }) => kind === 'enablement')
    if (stateChange) {
      await setRssFeedEnablementAsSystem(
        {
          rssFeedId: id,
          enabled: stateChange.enabled,
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
          enabled: discoverabilityChange.enabled,
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
