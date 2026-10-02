import { beginTransaction, isUniqueViolation, write } from '@data-stores/psql'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { createSlugFromTitle } from '@modules/utils'
import { createTopicEmbeddingContent } from '@services/topics/content'
import { linkHostnameToSourceTopic } from '@services/topics/hostname-link'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { createTopicRevision, computeTopicChanges } from '@services/topic-revisions'
import { getTopicByAny } from '@services/topics/get'
import { finalizeCreatedTopic } from '@services/topics/create'
import * as topicAliases from '@services/topics/aliases'
import * as topicAliasClaim from '@services/topics/claim-and-sync-alias'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { enqueueEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { findExistingFeedByUrlId } from './find-existing-feed.mts'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { randomBytes } from 'node:crypto'
import { createInitialRssFeedStateChanges } from './discoverability.mts'

export const followRssFeedRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  objectType: 'rss_feed',
  predicate: 'follow',
})

type ClaimedTopicAlias = Awaited<ReturnType<typeof topicAliases.claimTopicAlias>>
export type CreateSourceTransactionResult = {
  topicId: string
  rssFeedId: string
  claimedAlias: ClaimedTopicAlias
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

/** Slug = slugify(feedTitle + url-without-protocol), capped at 250 chars. Appends random hex suffix on retry. */
export function generateSourceDetails(
  topicName: string,
  feedTitle: string,
  feedUrl: string,
  attempt: number,
): { name: string; slug: string } {
  const urlPart = feedUrl
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .replace(/[./=?&#]/g, ' ')
  const baseSlug = createSlugFromTitle(`${feedTitle} ${urlPart}`, 250)
    .slice(0, 250)
    .replace(/-+$/, '')
  if (attempt === 0) return { name: topicName, slug: baseSlug }
  const suffix = randomBytes(2).toString('hex')
  return { name: topicName, slug: `${baseSlug}-${suffix}` }
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
    const [claimedAlias] = await Promise.all([
      topicAliasClaim.claimTopicAliasAndSync(topicId, slug, options),
      linkHostnameToSourceTopic(topicId, hostnameId, options),
    ])
    if (createdById) {
      const topic = (await getTopicByAny(topicId, options))!
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

    const result = { topicId, rssFeedId, claimedAlias }
    await query.commit()
    return result
  } catch (error) {
    if (isUniqueViolation(error) || topicAliasClaim.isTopicAliasOwnershipConflict(error))
      return null
    throw error
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

/** Shared wrapper: inserts topic+feed, updates bloom filter, enqueues crawl and discoverability eval. */
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
  const topic = await getTopicByAny(result.topicId)
  if (topic) {
    finalizeCreatedTopic(topic, { name: args.topicName, slug: args.slug, topic_type: 'rss_feed' })
  }
  void enqueueBulkFetchRssFeeds([result.rssFeedId], { ttl: 0 })
  void enqueueEvaluateRssFeedDiscoverability(result.rssFeedId)
  return { ...result, slug: args.slug, name: args.topicName }
}

/** Creates a source with slug-collision retry; returns null when a URL race condition is detected. */
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
