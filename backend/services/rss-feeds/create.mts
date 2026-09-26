import { beginTransaction, withTransactionOptions, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { isUUID, isYouTubeChannelFeedUrl } from '@modules/utils'
import { isPublicRssFeedUrl } from './url-validation.mts'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { assertTopicHasHostname } from '@services/topics/hostname-link'
import { createRssFeedUrlId } from './rss-feed-url-id.mts'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { enqueueEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { assertRssFeedUrlExists } from './validate.mts'
import { createInitialRssFeedStateChanges } from './discoverability.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { lockTopicRssFeedAttachmentLifecycle } from '@services/post-publication'

export type CreateRssFeedInput = {
  provenance: ContentProvenance
  rss_feed_url: string
  topic_id: string
  title?: string
  feed_type?: 'article' | 'podcast' | 'video' | 'mixed'
  created_by_id?: string | null
  /**
   * Skip the remote HTTP validation (fetch + parse check).
   * Set by trusted internal callers (bulk imports, sync workers, test helpers) that
   * handle feed reachability separately — e.g. the fetch worker soft-deletes permanently
   * broken feeds on first crawl. Do NOT set this in user-facing or untrusted code paths.
   */
  skipRemoteValidation?: boolean
  assertRssFeedUrlExistsImpl?: typeof assertRssFeedUrlExists
}

export const createRssFeed = async (
  options: CreateRssFeedInput,
  queryOptions: QueryOptions = {},
) => {
  assert(isPublicRssFeedUrl(options.rss_feed_url), 400, 'rss_feed_url must be a valid URL')
  assert(isUUID(options.topic_id), 400, 'topic_id must be a valid UUID')
  await assertTopicHasHostname(options.topic_id, queryOptions)

  if (!options.skipRemoteValidation) {
    await (options.assertRssFeedUrlExistsImpl ?? assertRssFeedUrlExists)(options.rss_feed_url)
  }

  const rssFeedUrlId = await createRssFeedUrlId(options.rss_feed_url, queryOptions)

  // YouTube channel feeds default to 'video'; all others get classified on first crawl.
  const feedType =
    options.feed_type ?? (isYouTubeChannelFeedUrl(options.rss_feed_url) ? 'video' : 'article')

  const feed =
    queryOptions.query || queryOptions.client
      ? await withTransactionOptions(queryOptions, query =>
          createRssFeedInTransaction(options, rssFeedUrlId, feedType, query),
        )
      : await createRssFeedInOwnedTransaction(options, rssFeedUrlId, feedType)

  // Fire-and-forget: trigger an immediate crawl so the feed is fetched without waiting
  // for the scheduled dispatcher. ttl=0 bypasses the "not fetched recently" check.
  // Skip if running inside a caller-managed transaction — the row may not be committed yet.
  if (!queryOptions.query && !queryOptions.client) {
    void enqueueBulkFetchRssFeeds([feed.id as string], { ttl: 0 })
    void enqueueEvaluateRssFeedDiscoverability(feed.id as string)
    void enqueueRefreshTopHashtags()
  }

  return feed
}

async function createRssFeedInOwnedTransaction(
  options: CreateRssFeedInput,
  rssFeedUrlId: string,
  feedType: 'article' | 'podcast' | 'video' | 'mixed',
) {
  await using transaction = await beginTransaction()
  const result = await createRssFeedInTransaction(options, rssFeedUrlId, feedType, transaction)
  await transaction.commit()
  return result
}

async function createRssFeedInTransaction(
  options: CreateRssFeedInput,
  rssFeedUrlId: string,
  feedType: 'article' | 'podcast' | 'video' | 'mixed',
  query: TransactionQuery,
) {
  await lockAndAssertRssFeedAttachmentTopic(query, options.topic_id)
  return insertRssFeedAndInitialState(options, rssFeedUrlId, feedType, query)
}

async function lockAndAssertRssFeedAttachmentTopic(
  query: TransactionQuery,
  topicId: string,
): Promise<void> {
  await lockTopicRssFeedAttachmentLifecycle(query, topicId)
  await assertTopicHasHostname(topicId, { query })
}

async function insertRssFeedAndInitialState(
  options: CreateRssFeedInput,
  rssFeedUrlId: string,
  feedType: 'article' | 'podcast' | 'video' | 'mixed',
  query: TransactionQuery,
) {
  const { rows } = await write(
    sql`/* createRssFeed */
      INSERT INTO rss_feeds (
        rss_feed_url_id,
        topic_id,
        title,
        feed_type,
        created_by_id,
        created_via,
        created_via_oauth_client_id
      )
      VALUES (
        ${rssFeedUrlId},
        ${options.topic_id},
        ${options.title?.trim() || null},
        ${feedType},
        ${options.created_by_id ?? null},
        ${options.provenance.createdVia},
        ${options.provenance.oauthClientId}
      )
      RETURNING *
    `,
    { query },
  )
  await createInitialRssFeedStateChanges(rows[0].id as string, { query })
  return rows[0]
}
