import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import {
  createTestPost,
  createTestUser,
  createTestTopic,
  createTestUrlWithHostname,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestRssFeedItem,
  getPostEmbeddingData,
  makeRandomEmbedding,
  readAllQueueJobs,
  setPostEmbeddingContentSha256,
  setTopicEmbeddingContentAndInputSha256,
  updatePostEmbeddingData,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics/embeddings'
import { ai_agents } from '@queues/ai-agents/queues'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import { createTopicEmbeddingContent } from '@services/topics/content'
import { processBedrockNovaMultimodalV1SingleJob } from '../../processors/nova-multimodal-v1-single.mts'

describe('bedrock embeddings single worker', () => {
  it('processes post jobs using an existing current embedding', async () => {
    const title = `Bedrock post worker ${randomUUID()}`
    const markdown = 'Post worker body with a preseeded embedding.'
    const post = await createTestPost({ title, markdown })
    const { content_sha256 } = createPostTextEmbeddingContent({ title, markdown })
    await setPostEmbeddingContentSha256(post!.id, content_sha256)
    await updatePostEmbeddingData({
      postId: post!.id,
      inputSha256: content_sha256,
      embedding: makeRandomEmbedding(),
      tokens: 11,
    })

    await expect(
      processBedrockNovaMultimodalV1SingleJob(makeJob('post', { id: post!.id }), {} as Worker),
    ).resolves.toEqual({ success: true })
  })

  it('enqueues ban-evasion detection after processing an embedded first community post', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id }),
    ])
    const suffix = randomUUID()
    const title = `Bedrock ban evasion post ${suffix}`
    const markdown = 'Embedded first post.'
    const postId = await insertTestPost({
      title,
      slug: `bedrock-ban-evasion-${suffix}`,
      markdown,
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })
    const { content_sha256 } = createPostTextEmbeddingContent({ title, markdown })
    await setPostEmbeddingContentSha256(postId, content_sha256)
    await updatePostEmbeddingData({
      postId,
      inputSha256: content_sha256,
      embedding: makeRandomEmbedding(),
      tokens: 11,
    })

    await expect(
      processBedrockNovaMultimodalV1SingleJob(makeJob('post', { id: postId }), {} as Worker),
    ).resolves.toEqual({ success: true })

    await expect(getPostEmbeddingData(postId)).resolves.toMatchObject({
      ban_evasion_post_embedding_input_sha: content_sha256,
    })
  })

  it('returns null for post jobs whose row no longer exists', async () => {
    await expect(
      processBedrockNovaMultimodalV1SingleJob(makeJob('post', { id: randomUUID() }), {} as Worker),
    ).resolves.toBeNull()
  })

  it('processes topic jobs using an existing current embedding', async () => {
    const topic = await createTestTopic({ name: `Bedrock topic worker ${randomUUID()}` })
    const { content_sha256 } = createTopicEmbeddingContent(topic)
    await setTopicEmbeddingContentAndInputSha256(topic.id, content_sha256)
    await updateTopicEmbeddingData({
      topicId: topic.id,
      inputSha256: content_sha256,
      embedding: makeRandomEmbedding(),
      tokens: 13,
    })

    await expect(
      processBedrockNovaMultimodalV1SingleJob(makeJob('topic', { id: topic.id }), {} as Worker),
    ).resolves.toEqual({ success: true })
  })

  it('returns null for topic jobs whose row no longer exists', async () => {
    await expect(
      processBedrockNovaMultimodalV1SingleJob(makeJob('topic', { id: randomUUID() }), {} as Worker),
    ).resolves.toBeNull()
  })

  it('enqueues story clustering after processing an RSS feed item with a current embedding', async () => {
    const rssFeed = await createTestRssFeed({})
    const urlId = await createTestUrlWithHostname()
    const itemData = {
      categories: ['integration-test'],
      contentSnippet: 'RSS item body with a preseeded embedding.',
      guid: `worker-rss-${randomUUID()}`,
      link: `https://example.com/rss-worker-${randomUUID()}`,
      title: `RSS item ${randomUUID()}`,
    }
    const { content_sha256 } = createRssFeedItemEmbeddingContent(itemData)
    const rssFeedItemId = await insertTestRssFeedItem({
      rssFeedId: rssFeed.id,
      urlId,
      guid: itemData.guid,
      itemData,
      contentSha256: content_sha256,
      embedding: makeRandomEmbedding(),
      tokens: 12,
    })

    await expect(
      processBedrockNovaMultimodalV1SingleJob(
        makeJob('rss_feed_item', { rss_feed_item_id: rssFeedItemId }),
        {} as Worker,
      ),
    ).resolves.toEqual({ success: true })

    const waiting = await readAllQueueJobs(ai_agents)
    expect(
      waiting.some(
        job =>
          job.name === 'story-clustering' &&
          (job.data as { rss_feed_item_id?: string }).rss_feed_item_id === rssFeedItemId,
      ),
    ).toBe(true)
  })

  it('returns null for RSS feed item jobs whose row no longer exists', async () => {
    await expect(
      processBedrockNovaMultimodalV1SingleJob(
        makeJob('rss_feed_item', { rss_feed_item_id: randomUUID() }),
        {} as Worker,
      ),
    ).resolves.toBeNull()
  })

  it('rejects malformed and unknown jobs through the retry handler', async () => {
    await expect(
      processBedrockNovaMultimodalV1SingleJob(makeJob('rss_feed_item', {}), {} as Worker),
    ).rejects.toThrow('rss_feed_item job requires rss_feed_item_id in job.data')

    await expect(
      processBedrockNovaMultimodalV1SingleJob(makeJob('unexpected', {}), {} as Worker),
    ).rejects.toThrow('Unknown job type: unexpected')
  })
})

function makeJob(
  name: string,
  data: { id?: string; rss_feed_item_id?: string },
): Job<{ id?: string; rss_feed_item_id?: string }> {
  return { data, name } as Job<{ id?: string; rss_feed_item_id?: string }>
}
