import { createHash, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import sql from 'sql-template-strings'
import {
  createAutotaggerRunAdapter,
  type AutotaggerRunConfiguration,
} from '../../../../services/autotagger/index.mts'
import {
  claimClassifierRun,
  requestClassifierRuns,
  requestRssFeedItemClassifierRuns,
  reserveClassifierRun,
  type ClassifierRunLease,
} from '../../../../services/classifier-runs/index.mts'
import { createPostModerationContent } from '../../../../services/posts/content.mts'
import { createRssFeedItemEmbeddingContent } from '../../../../services/rss-feed-items/content.mts'
import { createTestRssFeed } from '../../../rss-feed-create.mts'
import { addUrl } from '../../../../services/urls/upsert.mts'
import {
  addDummyEmbeddingToPost,
  addDummyEmbeddingToRssFeedItem,
  createTestMembership,
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestRssFeedItem,
  makeNearbyEmbedding,
  makeRandomEmbedding,
} from '../../../index.mts'
import { setTestRssFeedDiscoverable } from '../../../entities/rss-feeds-discovery.mts'
import { updateTopicEmbeddingData } from '../../../entities/topics.mts'

export { TAGGING_CLASSIFIER_SLUG }

type Topic = { id: string; name: string }

/** A topic whose embedding sits next to `base`, so an embedding search returns it. */
export async function createNearbyTopic(base: number[], scale?: number): Promise<Topic> {
  const topic = await createTestTopic({})
  await updateTopicEmbeddingData({
    topicId: topic.id,
    inputSha256: createHash('sha256').update(topic.id).digest(),
    embedding: makeNearbyEmbedding(base, scale),
    tokens: 10,
  })
  return { id: topic.id, name: topic.name }
}

/** Marks the post's stored embedding as built from its current content, as the embedder does. */
export async function embedAutotaggerPost(postId: string, embedding: number[]): Promise<void> {
  await addDummyEmbeddingToPost(postId, { embedding })
  await write(sql`/* markAutotaggerPostEmbeddingCurrent */
    UPDATE posts SET bedrock_nova_multimodal_v1_input_sha256 = bedrock_nova_multimodal_v1_content_sha256
    WHERE id = ${postId}
  `)
}

/** Marks the feed item's stored embedding as built from its current content, as the embedder does. */
export async function embedAutotaggerFeedItem(itemId: string, embedding: number[]): Promise<void> {
  await addDummyEmbeddingToRssFeedItem(itemId, { embedding })
  await write(sql`/* markAutotaggerFeedItemEmbeddingCurrent */
    UPDATE rss_feed_items SET bedrock_nova_multimodal_v1_input_sha256 = bedrock_nova_multimodal_v1_content_sha256
    WHERE id = ${itemId}
  `)
}

/**
 * An approved post for C6: the moderation digest is the request identity, the author holds a paid
 * plan (a free author's tier cap is zero topics), the post embedding is current when `embedded`,
 * and `topicCount` topics sit next to it so the candidate search finds them.
 */
export async function createAutotaggerPostFixture(
  options: {
    plan?: 'plus' | 'pro' | null
    administrator?: boolean
    embedded?: boolean
    topicCount?: number
  } = {},
) {
  const { plan = 'plus', administrator = false, embedded = true, topicCount = 2 } = options
  const user = await createTestUser({ administrator })
  if (plan) await createTestMembership({ user_id: user.id, plan })
  const post = await createTestPost({ user })
  const inputSha256 = createPostModerationContent(post).content_sha256
  await write(sql`/* setAutotaggerPostModerationHash */
    UPDATE posts SET llm_moderation_content_sha256 = ${inputSha256} WHERE id = ${post.id}
  `)
  const embedding = makeRandomEmbedding()
  if (embedded) await embedAutotaggerPost(post.id, embedding)
  const topics = await Promise.all(
    Array.from({ length: topicCount }, () => createNearbyTopic(embedding)),
  )
  const subject = { postId: post.id, rssFeedItemId: null } as const
  return { user, post, inputSha256, embedding, topics, subject }
}

export type AutotaggerPostFixture = Awaited<ReturnType<typeof createAutotaggerPostFixture>>

/**
 * A feed item for C6 whose content digest is what the receipt keys on. `embedded` gives it a
 * current embedding; `discoverable` decides whether its source feed is eligible for the LLM pass.
 */
export async function createAutotaggerFeedItemFixture(
  options: { discoverable?: boolean; embedded?: boolean; topicCount?: number } = {},
) {
  const { discoverable = true, embedded = true, topicCount = 2 } = options
  const feed = await createTestRssFeed({})
  if (!discoverable) await setTestRssFeedDiscoverable(feed.id, false)
  const url = await addUrl(null, `https://autotagger-item-${randomUUID()}.example.com/item`)
  const guid = `autotagger-item-${randomUUID()}`
  const itemData = { link: 'https://example.com', guid, title: `Autotagger item ${randomUUID()}` }
  const inputSha256 = createRssFeedItemEmbeddingContent(itemData).content_sha256
  const embedding = makeRandomEmbedding()
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: url!.id,
    guid,
    itemData,
    contentSha256: inputSha256,
    ...(embedded ? { embedding, tokens: 10 } : {}),
  })
  const topics = await Promise.all(
    Array.from({ length: topicCount }, () => createNearbyTopic(embedding)),
  )
  const subject = { postId: null, rssFeedItemId: itemId } as const
  return { feedId: feed.id, itemId, inputSha256, embedding, topics, subject }
}

export type AutotaggerFeedItemFixture = Awaited<ReturnType<typeof createAutotaggerFeedItemFixture>>

/** The durable request approval (or the feed upsert) writes for C6, and nothing else. */
export function requestAutotaggerRun(fixture: {
  subject: { postId: string; rssFeedItemId: null } | { postId: null; rssFeedItemId: string }
  inputSha256: Buffer
}) {
  return requestClassifierRuns(write, {
    subject: fixture.subject,
    inputSha256: fixture.inputSha256,
    classifierSlugs: [TAGGING_CLASSIFIER_SLUG],
  })
}

/** The request approval writes, then the reservation the dispatcher makes, without queueing a job. */
export async function reserveAutotaggerRun(fixture: Parameters<typeof requestAutotaggerRun>[0]) {
  await requestAutotaggerRun(fixture)
  const reserved = await reserveClassifierRun(createAutotaggerRunAdapter(), fixture.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Expected a reservation, got ${reserved.kind}`)
  return reserved.run
}

/** A live lease on the subject's freshly reserved run, for exercising C6's input building directly. */
export async function claimAutotaggerLease(
  fixture: Parameters<typeof requestAutotaggerRun>[0],
): Promise<ClassifierRunLease<AutotaggerRunConfiguration>> {
  const run = await reserveAutotaggerRun(fixture)
  const claim = await claimClassifierRun(createAutotaggerRunAdapter(), {
    runId: run.runId,
    subject: run.subject,
    inputSha256: run.inputSha256,
    configurationSha256: run.configurationSha256,
    leaseSeconds: 60,
  })
  if (claim.kind !== 'claimed') throw new Error(`Expected a claim, got ${claim.kind}`)
  return claim.lease
}

/** The upsert's request write for feed items, as the RSS upsert transaction makes it. */
export function requestAutotaggerFeedItems(itemIds: readonly string[]) {
  return requestRssFeedItemClassifierRuns(write, itemIds, [TAGGING_CLASSIFIER_SLUG])
}

/**
 * Moves a feed item to new content, as a re-upsert of a changed item does: the stored item and its
 * content digest both change, so a run keyed on the new digest can really execute. Returns the new
 * digest.
 */
export async function reviseAutotaggerFeedItem(itemId: string): Promise<Buffer> {
  const itemData = {
    link: 'https://example.com',
    guid: `autotagger-revision-${randomUUID()}`,
    title: `Autotagger revision ${randomUUID()}`,
  }
  const inputSha256 = createRssFeedItemEmbeddingContent(itemData).content_sha256
  await write(sql`/* reviseAutotaggerFeedItem */
    UPDATE rss_feed_items
    SET data = data || ${JSON.stringify({ title: itemData.title })}::jsonb,
        bedrock_nova_multimodal_v1_content_sha256 = ${inputSha256}
    WHERE id = ${itemId}
  `)
  return inputSha256
}
