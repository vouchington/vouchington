import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import { createTopicEmbeddingContent } from '@voucha/types/entities/topic'
import { insertTestTopic, createTestUser } from './index.mts'
import { createTestRssFeed } from './rss-feed-create.mts'
import { createStoryClusteringItem } from './data-stores/psql/classifier-runs/story-clustering-fixture.mts'
import { insertTestImageWithSha256 } from './entities/images-insert.mts'

const PREFIXES = {
  topics: 'topic',
  posts: 'post',
  rss_feed_items: 'rss_feed_item',
  crawl_chunks: 'crawl_chunk',
  images: 'image',
} as const
export type WorkerResultJobType = keyof typeof PREFIXES

export function describeWorkerResultEntity(
  jobType: WorkerResultJobType,
  rowId: string,
): WorkerResultEntity {
  const id = jobType === 'crawl_chunks' ? `${rowId}-0` : rowId
  return { jobType, rowId, id, key: `${PREFIXES[jobType]}:${id}` }
}

export interface WorkerResultEntity {
  jobType: WorkerResultJobType
  rowId: string
  id: string
  key: string
}

export async function createWorkerResultEntity(
  jobType: Exclude<WorkerResultJobType, 'posts' | 'crawl_chunks'>,
): Promise<WorkerResultEntity> {
  let rowId: string
  if (jobType === 'topics') {
    const user = await createTestUser()
    const name = `Worker topic ${randomUUID()}`
    const { content_sha256 } = createTopicEmbeddingContent({ name, aliases: [], markdown: '' })
    rowId = await insertTestTopic({
      name,
      slug: `worker-topic-${randomUUID()}`,
      createdById: user.id,
      embeddingSha256: `\\x${content_sha256.toString('hex')}`,
    })
  } else if (jobType === 'rss_feed_items') {
    const feed = await createTestRssFeed({})
    rowId = (await createStoryClusteringItem({ feedId: feed.id })).itemId
  } else {
    const user = await createTestUser()
    rowId = (await insertTestImageWithSha256(user.id)).id
  }
  return describeWorkerResultEntity(jobType, rowId)
}

export async function readWorkerResultEntity(entity: WorkerResultEntity) {
  const table = entity.jobType
  const image = table === 'images'
  const hash = image ? 'sha_256' : 'gemini_embedding_2_content_sha256'
  const inputHash = image ? 'sha_256' : 'gemini_embedding_2_input_sha256'
  const predicate = table === 'crawl_chunks' ? 'crawl_id = $1 AND order_index = 0' : 'id = $1'
  const { rows } = await read<{
    hash: Buffer
    input_hash: Buffer | null
    embedding: Float32Array | null
    created_at: Date | null
  }>(
    `/* readWorkerResultEntity */ SELECT ${hash} AS hash, ${inputHash} AS input_hash,
      gemini_embedding_2_embedding AS embedding, gemini_embedding_2_embedding_created_at AS created_at
      FROM ${table} WHERE ${predicate}`,
    [entity.rowId],
  )
  if (!rows[0]) throw new Error('Missing owned worker-result entity')
  return rows[0]
}

export async function insertWorkerResultMembership(batchId: string, entity: WorkerResultEntity) {
  if (entity.jobType === 'crawl_chunks') {
    await write(
      `/* insertWorkerResultMembership */ INSERT INTO gemini_embedding_batch_entities
      (batch_id, entity_type, crawl_id, crawl_order_index) VALUES ($1, 'crawl_chunks', $2, 0)`,
      [batchId, entity.rowId],
    )
    return
  }
  const column = (() => {
    switch (entity.jobType) {
      case 'topics':
        return 'topic_id'
      case 'posts':
        return 'post_id'
      case 'rss_feed_items':
        return 'rss_feed_item_id'
      case 'images':
        return 'image_id'
      default:
        throw new Error('Unsupported worker membership entity')
    }
  })()
  await write(
    `/* insertWorkerResultMembership */ INSERT INTO gemini_embedding_batch_entities
    (batch_id, entity_type, ${column}) VALUES ($1, $2, $3)`,
    [batchId, entity.jobType, entity.rowId],
  )
}
