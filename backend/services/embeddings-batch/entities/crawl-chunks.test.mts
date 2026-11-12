import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCrawlChunks } from '@services/crawl-chunks/create'
import { createCrawlChunkEmbeddingContent } from '@services/crawl-chunks/content'
import { createEmbeddingTextRecordLine } from '@services/embeddings/batch/input-size-limits'
import { lookupExistingEmbeddings } from '@services/embeddings/lookup'
import {
  createTestUrlWithHostname,
  insertTestCrawl,
  getAllCrawlChunksForUrl,
  crawlHasPendingEmbeddings,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { streamPendingCrawlChunks, applyCrawlChunkBatchUpdates } from './crawl-chunks.mts'

function nextId(id: string) {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

describe('crawl breadcrumb embedding identity', () => {
  it('persists and submits the same full body, then reuses its cached vector on the next crawl', async () => {
    const title = `Breadcrumb ${randomUUID()}`
    const markdown = 'Synthetic crawl body with its own page context.'
    const fullBody = `${title}\n\n${markdown}`
    const hash = createCrawlChunkEmbeddingContent({
      text: markdown,
      breadcrumb: title,
      headers: [title],
      level: 0,
      length: fullBody.length,
    }).content_sha256
    const urlId = await createTestUrlWithHostname()
    const crawl = await insertTestCrawl({ urlId, statusCode: 200, markdown, metaTags: { title } })
    await createCrawlChunks({ id: crawl.id, url_id: urlId, markdown, meta_tags: { title } })
    expect((await getAllCrawlChunksForUrl(urlId))[0]).toMatchObject({
      markdown: fullBody,
      gemini_embedding_2_content_sha256: hash,
    })
    let applied = false
    for await (const row of streamPendingCrawlChunks({
      cursor: {
        sweepStartedAt: new Date(Date.now() + 60_000).toISOString(),
        afterId: nextId(crawl.id),
      },
      limits: { batchSize: 1, maxRows: 1 },
    })) {
      expect(row.crawl_id).toBe(crawl.id)
      expect(row.content).toBe(fullBody)
      expect(row.content_sha256).toEqual(hash)
      const record = JSON.parse(
        createEmbeddingTextRecordLine(
          { entity_id: row.id, content: row.content, content_sha256: row.content_sha256 },
          'crawl_chunks',
        ),
      )
      expect(record.request.content.parts[0].text).toBe(`title: none | text: ${fullBody}`)
      await applyCrawlChunkBatchUpdates([
        {
          entity_id: row.id,
          content_sha256: hash,
          embedding: makeRandomEmbedding(),
          input_token_count: 17,
        },
      ])
      applied = true
    }
    expect(applied).toBe(true)
    expect((await lookupExistingEmbeddings([hash])).has(hash.toString('hex'))).toBe(true)
    const secondUrlId = await createTestUrlWithHostname()
    const second = await insertTestCrawl({
      urlId: secondUrlId,
      statusCode: 200,
      markdown,
      metaTags: { title },
    })
    await createCrawlChunks({ id: second.id, url_id: secondUrlId, markdown, meta_tags: { title } })
    expect((await getAllCrawlChunksForUrl(secondUrlId))[0]).toMatchObject({
      markdown: fullBody,
      gemini_embedding_2_content_sha256: hash,
      gemini_embedding_2_input_sha256: hash,
    })
    expect(await crawlHasPendingEmbeddings(secondUrlId, second.id)).toBe(false)
  })
})
