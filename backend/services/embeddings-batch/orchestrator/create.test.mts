import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { createLockedEntityId } from '@voucha/test-helpers/gemini-batch-creation-fixtures'
import { createTestUserDirect } from '@voucha/test-helpers'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchEntities,
  getTestBatchSummary,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { createBatch } from './create.mts'

const directories: string[] = []
const batches: string[] = []
async function files(ids: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'vertex-submit-'))
  directories.push(directory)
  const input = join(directory, 'input.jsonl')
  const locks = join(directory, 'locks.csv')
  await writeFile(input, '{}\n')
  await writeFile(locks, ids.map(id => `${id},${'a'.repeat(64)}\n`).join(''))
  return { input, locks }
}

describe('Vertex batch submission', () => {
  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(batches.splice(0))
    await Promise.all(
      directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
    )
  })
  it.each(['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'] as const)(
    'persists typed %s locks and a canonical Vertex resource name',
    async jobType => {
      const fixture = createVertexHttpFixture()
      const owner = await createTestUserDirect()
      const entityId = await createLockedEntityId(jobType, owner.id)
      const file = await files([entityId])
      fixture.agent
        .get('https://storage.googleapis.com')
        .intercept({ method: 'POST', path: /\/upload\/storage\/v1\// })
        .reply(200, {})
        .times(2)
      fixture.agent
        .get('https://us-aiplatform.googleapis.com')
        .intercept({
          method: 'POST',
          path: '/v1/projects/synthetic-project/locations/us/batchPredictionJobs',
        })
        .reply(200, {
          name: `projects/123456/locations/us/batchPredictionJobs/${randomUUID()}`,
          state: 'JOB_STATE_PENDING',
        })
      const id = await fixture.run(() =>
        createBatch(
          file.input,
          jobType,
          1,
          file.locks,
          {},
          {},
          async batchId => {
            batches.push(batchId)
          },
          () => true,
        ),
      )
      expect(await getTestBatchEntities(id)).toEqual([
        { entity_type: jobType, entity_id: entityId },
      ])
      expect(await getTestBatchSummary(id)).toEqual({ job_type: jobType, status: 'submitted' })
    },
  )
  it('cleans a prepared batch when upload fails before any paid submission', async () => {
    const fixture = createVertexHttpFixture()
    const owner = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', owner.id)
    const file = await files([entityId])
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'POST', path: /\/upload\/storage\/v1\// })
      .reply(503, {})
    await fixture.run(async () => {
      await expect(
        createBatch(
          file.input,
          'topics',
          1,
          file.locks,
          {},
          {},
          async id => {
            batches.push(id)
          },
          () => true,
        ),
      ).rejects.toThrow('(503)')
    })
  })
  it('keeps the domain intent and entity locks when submission has an ambiguous transport failure', async () => {
    const fixture = createVertexHttpFixture()
    const owner = await createTestUserDirect()
    const entityId = await createLockedEntityId('topics', owner.id)
    const file = await files([entityId])
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'POST', path: /\/upload\/storage\/v1\// })
      .reply(200, {})
      .times(2)
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({ method: 'POST', path: /\/batchPredictionJobs$/ })
      .replyWithError(new Error('synthetic lost response'))
    let candidate = ''
    await fixture.run(async () => {
      await expect(
        createBatch(
          file.input,
          'topics',
          1,
          file.locks,
          {},
          {},
          async id => {
            candidate = id
            batches.push(id)
          },
          () => true,
        ),
      ).rejects.toThrow('fetch failed')
    })
    expect(await getTestBatchSummary(candidate)).toMatchObject({ status: 'submitted' })
    expect(await getTestBatchEntities(candidate)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
  })
  it('rejects the provider hard record cap before durable or external effects', async () => {
    const file = await files([])
    const fixture = createVertexHttpFixture()
    await fixture.run(async () => {
      await expect(
        createBatch(
          file.input,
          'topics',
          1_000_001,
          file.locks,
          {},
          {},
          async () => undefined,
          () => true,
        ),
      ).rejects.toThrow('record limit')
    })
  })
})
