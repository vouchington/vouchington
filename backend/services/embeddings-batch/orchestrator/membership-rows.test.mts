import {
  cleanupTestEmbeddingsBatches,
  getTestBatchEntities,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { randomUUID } from 'node:crypto'
import { writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mintUUIDv7 } from '@modules/utils/ids'
import { createTestUserDirect, insertTestTopic } from '@voucha/test-helpers'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics/deletion'
import { describe, expect, it, onTestFinished } from 'vitest'
import { insertBatchWithMembership } from './persist-batch.mts'

describe('topic embedding batch admission (real PG)', () => {
  it('rejects the whole provider input when one candidate is already merged', async () => {
    const actor = await createTestUserDirect()
    const suffix = randomUUID()
    const sourceId = await insertTestTopic({
      name: `Embedding source ${suffix}`,
      slug: `embedding-source-${suffix}`,
      createdById: actor.id,
    })
    const destinationId = await insertTestTopic({
      name: `Embedding destination ${suffix}`,
      slug: `embedding-destination-${suffix}`,
      createdById: actor.id,
    })
    await mergeTopicForTest(sourceId, destinationId, actor.id)
    const filePath = join(tmpdir(), `topic-batch-${suffix}.csv`)
    await writeFile(filePath, `${sourceId},${'a'.repeat(64)}\n${destinationId},${'b'.repeat(64)}\n`)
    try {
      await expect(
        insertBatchWithMembership({
          batchId: mintUUIDv7(),
          jobType: 'topics',
          entityCount: 2,
          entityIdsFilePath: filePath,
          data: {},
          urlId: null,
          crawlId: null,
        }),
      ).rejects.toThrow('inactive topic')
    } finally {
      await rm(filePath, { force: true })
    }
  })
  it('records the same entity in two batches without claiming exclusive ownership', async () => {
    const actor = await createTestUserDirect()
    const suffix = randomUUID()
    const topic = await insertTestTopic({
      name: `Shared ${suffix}`,
      slug: `shared-${suffix}`,
      createdById: actor.id,
    })
    const ids = [mintUUIDv7(), mintUUIDv7()]
    onTestFinished(() => cleanupTestEmbeddingsBatches(ids))
    const filePath = join(tmpdir(), `shared-batch-${suffix}.csv`)
    await writeFile(filePath, `${topic},${'a'.repeat(64)}\n`)
    try {
      await Promise.all(
        ids.map(batchId =>
          insertBatchWithMembership({
            batchId,
            jobType: 'topics',
            entityCount: 1,
            entityIdsFilePath: filePath,
            data: {},
            urlId: null,
            crawlId: null,
          }),
        ),
      )
      const memberships = await Promise.all(ids.map(getTestBatchEntities))
      expect(memberships).toEqual(ids.map(() => [{ entity_type: 'topics', entity_id: topic }]))
    } finally {
      await rm(filePath, { force: true })
    }
  })
})
