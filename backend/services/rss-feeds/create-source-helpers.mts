import { beginTransaction, isUniqueViolation, write } from '@data-stores/psql'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { createTopicEmbeddingContent } from '@services/topics/content'
import { linkHostnameToSourceTopic } from '@services/topics/hostname-link'
import {
  lockHostnameOwnership,
  registerCreatedTopicsForHostnameOwnership,
} from '@services/urls-hostnames/ownership-lock'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { createTopicRevision, computeTopicChanges } from '@services/topic-revisions'
import { getTopicByAny } from '@services/topics/get'
import { finalizeCreatedTopic } from '@services/topics/create'
import * as topicAliases from '@services/topics/aliases'
import { claimTopicAlias } from '@services/topics/claim-topic-alias'
import { isTopicAliasOwnershipConflict } from '@services/topics/alias-errors'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { enqueueEvaluateRssFeedDiscoverability } from '@queues/rss-feed-maintenance/enqueues/discoverability'
import { findExistingFeedByUrlId } from './find-existing-feed.mts'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { generateSourceDetails } from './generate-source-details.mts'
import { createInitialRssFeedStateChanges } from './discoverability.mts'
import { lockTopicRssFeedAttachmentLifecycle } from '@services/post-publication'

export const followRssFeedRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  objectType: 'rss_feed',
  predicate: 'follow',
})
export type CreateSourceTransactionResult = {
  topicId: string
  rssFeedId: string
  claimedAlias: Awaited<ReturnType<typeof topicAliases.claimTopicAlias>>
  topic: Awaited<ReturnType<typeof getTopicByAny>>
}
type CreateSourceWithRetryArgs = {
  provenance: ContentProvenance
  currentUser: BasicUser
  rssFeedUrlId: string
  hostnameId: string
  feedUrl: string
  topicName: string
  rawTitle: string
  feedTitle: string | null
  feedType: 'article' | 'podcast' | 'video' | 'mixed'
  attempt: number
}

/** Creates a topic (type=rss_feed) and rss_feeds row in a transaction; returns null on unique violation. */
export async function createSourceInTransaction(
  provenance: ContentProvenance,
  createdById: string | null,
  rssFeedUrlId: string,
  hostnameId: string,
  topicName: string,
  slug: string,
  feedTitle: string | null,
  feedType: 'article' | 'podcast' | 'video' | 'mixed',
): Promise<CreateSourceTransactionResult | null> {
  try {
    await using query = await beginTransaction()
    const options = { query }
    await lockHostnameOwnership(query, [hostnameId])
    const { content_sha256 } = createTopicEmbeddingContent({ name: topicName })
    const { rows: topicRows } = await write(
      sql`/* createSourceInTransaction:topic */
          INSERT INTO topics (
            name, slug, topic_type, created_by_id, bedrock_nova_multimodal_v1_content_sha256,
            created_via, created_via_oauth_client_id
          )
          VALUES (
            ${topicName}, ${slug}, 'rss_feed', ${createdById}, ${content_sha256},
            ${provenance.createdVia}, ${provenance.oauthClientId}
          )
          RETURNING id
        `,
      options,
    )
    const topicId = topicRows[0].id as string
    registerCreatedTopicsForHostnameOwnership(query, [topicId])
    // This new topic is private to this transaction; both parallel guarded writers inherit its fence.
    await lockTopicRssFeedAttachmentLifecycle(query, topicId)
    const [claimedAlias] = await Promise.all([
      claimTopicAlias(topicId, slug, options),
      linkHostnameToSourceTopic(topicId, hostnameId, options),
    ])
    let topic: CreateSourceTransactionResult['topic'] = null
    if (createdById) {
      topic = (await getTopicByAny(topicId, options))!
      const changes = computeTopicChanges(null, topic)
      await createTopicRevision(topicId, 'create', changes, createdById, options)
    }

    const { rows: feedRows } = await write(
      sql`/* createSourceInTransaction:rss_feed */
          INSERT INTO rss_feeds (rss_feed_url_id, topic_id, title, feed_type, created_by_id,
            created_via, created_via_oauth_client_id)
          VALUES (${rssFeedUrlId}, ${topicId}, ${feedTitle}, ${feedType}, ${createdById},
            ${provenance.createdVia}, ${provenance.oauthClientId})
          RETURNING id
        `,
      options,
    )
    const rssFeedId = feedRows[0].id as string
    await createInitialRssFeedStateChanges(rssFeedId, options)

    const result = { topicId, rssFeedId, claimedAlias, topic }
    await query.commit()
    return result
  } catch (err) {
    if (isUniqueViolation(err) || isTopicAliasOwnershipConflict(err)) return null
    throw err
  }
}

export type CreateRssFeedSourceArgs = {
  provenance: ContentProvenance
  rssFeedUrlId: string
  hostnameId: string
  topicName: string
  slug: string
  feedTitle: string | null
  feedType?: 'article' | 'podcast' | 'video' | 'mixed'
  createdById: string | null
}

export async function createRssFeedSource(
  args: CreateRssFeedSourceArgs,
): Promise<(CreateSourceTransactionResult & { slug: string; name: string }) | null> {
  const result = await createSourceInTransaction(
    args.provenance,
    args.createdById,
    args.rssFeedUrlId,
    args.hostnameId,
    args.topicName,
    args.slug,
    args.feedTitle,
    args.feedType ?? 'article',
  )
  if (!result) return null
  await topicAliases.finalizeClaimedTopicAliases(result.topicId, [result.claimedAlias])
  const topic = result.topic ?? (await getTopicByAny(result.topicId))
  if (topic) {
    finalizeCreatedTopic(topic, { name: args.topicName, slug: args.slug, topic_type: 'rss_feed' })
  }
  void enqueueBulkFetchRssFeeds([result.rssFeedId], { ttl: 0, deduplicationScope: 'request' })
  void enqueueEvaluateRssFeedDiscoverability(result.rssFeedId)
  return { ...result, slug: args.slug, name: args.topicName }
}

export async function createSourceWithRetry(
  args: CreateSourceWithRetryArgs,
): Promise<(CreateSourceTransactionResult & { slug: string; name: string }) | null> {
  const {
    provenance,
    currentUser,
    rssFeedUrlId,
    hostnameId,
    feedUrl,
    topicName,
    rawTitle,
    feedTitle,
    feedType,
    attempt,
  } = args
  const { name, slug } = generateSourceDetails(topicName, rawTitle, feedUrl, attempt)
  const result = await createRssFeedSource({
    provenance,
    rssFeedUrlId,
    hostnameId,
    topicName: name,
    slug,
    feedTitle,
    feedType,
    createdById: currentUser.id,
  })
  if (result) return result

  // After any unique violation, check if it was a URL race condition first.
  const raceExisting = await findExistingFeedByUrlId(rssFeedUrlId)
  if (raceExisting) return null

  assert(attempt < 2, 409, 'A source topic with this name already exists')
  return createSourceWithRetry({ ...args, attempt: attempt + 1 })
}
