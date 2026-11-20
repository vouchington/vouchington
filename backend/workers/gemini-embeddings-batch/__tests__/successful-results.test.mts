import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createPost } from '@services/posts/create'
import { createCrawlChunks } from '@services/crawl-chunks/create'
import { lookupExistingEmbeddings } from '@services/embeddings/lookup'
import {
  createTestUser,
  createTestUrlWithHostname,
  insertTestCrawl,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createWorkerResultEntity,
  describeWorkerResultEntity,
  type WorkerResultEntity,
} from '@voucha/test-helpers/gemini-worker-results'
import { runWorkerResult } from '@voucha/test-helpers/gemini-gcs-results'
import { processBatchPolling } from '../processors.mts'

describe('successful Vertex worker result ingestion', () => {
  it.each(['topics', 'posts', 'rss_feed_items', 'crawl_chunks'] as const)(
    'applies %s through pinned GCS output and reuses the canonical cache receipt',
    async jobType => {
      let entity: WorkerResultEntity
      if (jobType === 'posts') {
        const user = await createTestUser()
        const post = await createPost(user, WEB_PROVENANCE, {
          title: `Worker post ${randomUUID()}`,
          markdown: 'Owned worker result body',
          post_type: 'discussion',
        })
        entity = describeWorkerResultEntity(jobType, post.id)
      } else if (jobType === 'crawl_chunks') {
        const urlId = await createTestUrlWithHostname()
        const markdown = `Worker crawl ${randomUUID()}`
        const title = `Worker breadcrumb ${randomUUID()}`
        const crawl = await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown,
          metaTags: { title },
        })
        await createCrawlChunks({ id: crawl.id, url_id: urlId, markdown, meta_tags: { title } })
        entity = describeWorkerResultEntity(jobType, crawl.id)
      } else entity = await createWorkerResultEntity(jobType)
      const result = await runWorkerResult({ entity, process: processBatchPolling })
      expect(result.before.embedding).toBeNull()
      expect(result.stored.input_hash).toEqual(result.before.hash)
      expect(result.stored.embedding).toHaveLength(1536)
      expect(result.stored.embedding![0]).toBeCloseTo(result.vector[0], 3)
      expect(result.stored.created_at).toBeInstanceOf(Date)
      const cached = (await lookupExistingEmbeddings([result.before.hash])).get(
        result.before.hash.toString('hex'),
      )
      expect(cached?.embedding).toEqual(result.stored.embedding)
      expect(cached?.input_token_count).toBe(17)
      expect(result.firstResult).toEqual({ success: true, processed: true })
      expect(result.duplicateResult).toEqual(result.firstResult)
      expect(result.afterDuplicate).toEqual(result.stored)
      expect(result.summary).toMatchObject({ status: 'completed' })
      expect(result.memberships).toEqual([])
      expect(result.polls).toBe(1)
      expect(result.reads).toEqual([result.generation, result.generation])
    },
  )

  it('applies an image vector from its original SHA and does not repeat paid work on duplicate delivery', async () => {
    const entity = await createWorkerResultEntity('images')
    const result = await runWorkerResult({ entity, process: processBatchPolling })
    expect(result.before.embedding).toBeNull()
    expect(result.stored.input_hash).toEqual(result.before.hash)
    expect(result.stored.embedding).toHaveLength(1536)
    expect(result.stored.embedding![0]).toBeCloseTo(result.vector[0], 3)
    expect(result.stored.created_at).toBeInstanceOf(Date)
    expect(result.firstResult).toEqual({ success: true, processed: true })
    expect(result.duplicateResult).toEqual(result.firstResult)
    expect(result.afterDuplicate).toEqual(result.stored)
    expect(result.summary).toMatchObject({ status: 'completed' })
    expect(result.memberships).toEqual([])
    expect(result.polls).toBe(1)
    expect(result.reads).toEqual([result.generation, result.generation])
  })

  it('accounts for a provider image-row failure while leaving the image unembedded for a later batch', async () => {
    const entity = await createWorkerResultEntity('images')
    const result = await runWorkerResult({ entity, process: processBatchPolling, rowFailure: true })
    expect(result.stored).toEqual(result.before)
    expect(result.stored.embedding).toBeNull()
    expect(result.firstResult).toEqual({ success: true, processed: true })
    expect(result.duplicateResult).toEqual(result.firstResult)
    expect(result.afterDuplicate).toEqual(result.before)
    expect(result.summary).toMatchObject({ status: 'completed' })
    expect(result.memberships).toEqual([])
    expect(result.polls).toBe(1)
    expect(result.reads).toEqual([result.generation, result.generation])
  })
})
