import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestCrawlWithChunks,
  createTestUser,
  getAllCrawlChunksForUrl,
  getTopicEmbeddingData,
  insertTestTopic,
  makeRandomEmbedding,
  setCrawlChunkEmbeddingContentSha256,
  setTopicEmbeddingContentSha256,
} from '@voucha/test-helpers'
import { applyCrawlChunkBatchUpdates } from '../../entities/crawl-chunks.mts'
import { createCrawlChunkEntityId } from '../../entities/crawl-chunk-entity-id.mts'
import { applyBatchUpdates } from '../save.mts'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics/deletion'

describe('batch embedding token count provenance', () => {
  it('does not apply a returned embedding after its topic merges', async () => {
    const actor = await createTestUser()
    const suffix = randomUUID()
    const contentSha256 = randomBytes(32)
    const sourceId = await insertTestTopic({
      name: `Batch merged source ${suffix}`,
      slug: `batch-merged-source-${suffix}`,
      createdById: actor.id,
      embeddingSha256: `\\x${contentSha256.toString('hex')}`,
    })
    const destinationId = await insertTestTopic({
      name: `Batch merged destination ${suffix}`,
      slug: `batch-merged-destination-${suffix}`,
      createdById: actor.id,
    })
    await mergeTopicForTest(sourceId, destinationId, actor.id)

    expect(
      await applyBatchUpdates('topics', [
        {
          entity_id: sourceId,
          content_sha256: contentSha256,
          embedding: makeRandomEmbedding(),
          input_token_count: null,
        },
      ]),
    ).toEqual([])
    expect(await getTopicEmbeddingData(sourceId)).toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: null,
    })
  })

  it('keeps a topic count for the same input and clears it for a new input without usage', async () => {
    const user = await createTestUser()
    const suffix = randomUUID().slice(0, 8)
    const oldHash = randomBytes(32)
    const newHash = randomBytes(32)
    const topicId = await insertTestTopic({
      name: `Batch count ${suffix}`,
      slug: `batch-count-${suffix}`,
      createdById: user.id,
      embeddingSha256: `\\x${oldHash.toString('hex')}`,
    })
    const embedding = makeRandomEmbedding()
    const update = (content_sha256: Buffer, input_token_count: number | null) =>
      applyBatchUpdates('topics', [
        { entity_id: topicId, content_sha256, embedding, input_token_count },
      ])

    await update(oldHash, 7)
    await update(oldHash, null)
    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      bedrock_nova_multimodal_v1_input_token_count: 7,
    })

    await setTopicEmbeddingContentSha256(topicId, newHash)
    await update(newHash, null)
    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: newHash,
      bedrock_nova_multimodal_v1_input_token_count: null,
    })
  })

  it('keeps a crawl chunk count for the same input and clears it for a new input without usage', async () => {
    const { url, crawl } = await createTestCrawlWithChunks({
      markdown: `Batch crawl count ${randomUUID()}`,
    })
    const chunks = (await getAllCrawlChunksForUrl(url!.id)) as Array<{
      crawl_id: string
      order_index: number
      bedrock_nova_multimodal_v1_content_sha256: Buffer
      bedrock_nova_multimodal_v1_input_sha256: Buffer | null
      bedrock_nova_multimodal_v1_input_token_count: number | null
    }>
    expect(chunks).toHaveLength(1)
    const chunk = chunks[0]!
    const oldHash = chunk.bedrock_nova_multimodal_v1_content_sha256
    const newHash = randomBytes(32)
    const embedding = makeRandomEmbedding()
    const entity_id = createCrawlChunkEntityId(chunk.crawl_id, chunk.order_index)
    const update = (content_sha256: Buffer, input_token_count: number | null) =>
      applyCrawlChunkBatchUpdates([{ entity_id, content_sha256, embedding, input_token_count }])
    const readChunk = async () => ((await getAllCrawlChunksForUrl(url!.id)) as typeof chunks)[0]!

    await update(oldHash, 7)
    await update(oldHash, null)
    expect((await readChunk()).bedrock_nova_multimodal_v1_input_token_count).toBe(7)

    await setCrawlChunkEmbeddingContentSha256(crawl.id, chunk.order_index, newHash)
    await update(newHash, null)
    expect(await readChunk()).toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: newHash,
      bedrock_nova_multimodal_v1_input_token_count: null,
    })
  })
})
