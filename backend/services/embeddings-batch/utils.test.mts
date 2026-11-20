import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import {
  createTestUserDirect,
  insertTestTopic,
  insertTestRssFeed,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'
import { createTestPost } from '@voucha/test-helpers/services/posts/test-support'
import { createTopicEmbeddingContent } from '@services/topics/content'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchIdByJobName,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { streamPendingTopics } from './entities/topics.mts'
import { streamPendingPosts } from './entities/posts.mts'
import { streamPendingRssFeedItems } from './entities/rss-feed-items.mts'
import type { PendingEntity } from './entities/shared.mts'
import { processBatchCreation } from './utils.mts'

const streams = {
  topics: streamPendingTopics,
  posts: streamPendingPosts,
  rss_feed_items: streamPendingRssFeedItems,
}
function nextId(id: string) {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

describe('persisted entity title through real batch submission', () => {
  beforeEach(async () => {
    await acquireEmbeddingQuotaFixture()
  })
  it.each(['topics', 'posts', 'rss_feed_items'] as const)(
    'sends the stored %s title separately from its body',
    async jobType => {
      const fixture = createVertexHttpFixture()
      const owner = await createTestUserDirect()
      const title = `Prompt owner ${randomUUID()}`
      const topic = await insertTestTopic({
        name: title,
        slug: `prompt-${randomUUID()}`,
        createdById: owner.id,
        embeddingSha256: `\\x${createTopicEmbeddingContent({ name: title }).content_sha256.toString('hex')}`,
      })
      let entityId = topic
      if (jobType === 'posts') {
        const post = await createTestPost({ title, markdown: 'Unique post body' })
        if (!post) throw new Error('Expected created post')
        entityId = post.id
      } else if (jobType === 'rss_feed_items') {
        const rssFeedId = await insertTestRssFeed({ topicId: topic, title: 'Prompt feed' })
        const urlId = await createTestUrlWithHostname()
        const itemData = {
          title,
          content: 'Unique RSS body',
          guid: randomUUID(),
          link: `https://example.com/${randomUUID()}`,
        }
        entityId = await insertTestRssFeedItem({
          rssFeedId,
          urlId,
          guid: itemData.guid,
          itemData,
          contentSha256: createRssFeedItemEmbeddingContent(itemData).content_sha256,
        })
      }
      const jobName = `projects/123456/locations/us/batchPredictionJobs/${randomUUID()}`
      let observed: PendingEntity | undefined
      let prompt = ''
      fixture.agent
        .get('https://storage.googleapis.com')
        .intercept({
          method: 'POST',
          path: /\/upload\/storage\/v1\//,
          body: bytes => {
            if (!Buffer.isBuffer(bytes)) return false
            const text = bytes.toString('utf8')
            if (text.startsWith('{')) prompt = JSON.parse(text).request.content.parts[0].text
            return true
          },
        })
        .reply(200, {})
        .times(2)
      fixture.agent
        .get('https://us-aiplatform.googleapis.com')
        .intercept({ method: 'POST', path: /\/batchPredictionJobs$/ })
        .reply(200, { name: jobName, state: 'JOB_STATE_PENDING' })
      onTestFinished(async () => {
        const id = await getTestBatchIdByJobName(jobName)
        if (id) await cleanupTestEmbeddingsBatches([id])
      })
      await fixture.run(async () => {
        const result = await processBatchCreation<PendingEntity>({
          jobType,
          isLeaseHeld: () => true,
          reEnqueue: () => {},
          streamPending: async function* (options) {
            for await (const row of streams[jobType]({
              ...options,
              cursor: {
                sweepStartedAt: new Date(Date.now() + 60_000).toISOString(),
                afterId: nextId(entityId),
              },
              limits: { batchSize: 1, maxRows: 1 },
            })) {
              expect(row.id).toBe(entityId)
              observed = row
              yield row
            }
          },
        })
        expect(result).toMatchObject({ success: true })
      })
      expect(observed?.title).toEqual(expect.any(String))
      expect(observed?.title?.length).toBeGreaterThan(0)
      expect(prompt).toBe(`title: ${observed!.title} | text: ${observed!.content}`)
      expect(observed!.content).not.toContain(observed!.title)
    },
  )
})
