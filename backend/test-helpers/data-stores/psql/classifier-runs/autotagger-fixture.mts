import { createHash, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import sql from 'sql-template-strings'
import { requestClassifierRuns } from '../../../../services/classifier-runs/index.mts'
import { createPostModerationContent } from '../../../../services/posts/content.mts'
import { createRssFeedItemEmbeddingContent } from '../../../../services/rss-feed-items/content.mts'
import { createTestRssFeed } from '../../../../services/rss-feeds/test-fixtures.mts'
import { addUrl } from '../../../../services/urls/upsert.mts'
import {
  addDummyEmbeddingToPost,
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

/** Topics a run voted on, from the durable vote-application receipts of its subject. */
export async function readAutotaggerVotedTopicIds(subject: {
  postId: string | null
  rssFeedItemId: string | null
}): Promise<string[]> {
  const { rows } = await write<{ topic_id: string }>(sql`/* readAutotaggerVotedTopicIds */
    SELECT topic_id FROM classifier_topic_vote_applications
    WHERE post_id IS NOT DISTINCT FROM ${subject.postId}::uuid
      AND rss_feed_item_id IS NOT DISTINCT FROM ${subject.rssFeedItemId}::uuid
    ORDER BY topic_id
  `)
  return rows.map(row => row.topic_id)
}
