import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { createTestBatch, createTestUserDirect, insertTestTopic } from '@voucha/test-helpers'
import {
  getTestBatchEntities,
  cleanupTestEmbeddingsBatches,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBatch as submitBatch } from '../create.mts'

describe('batch membership admission', () => {
  async function writeTempFile(name: string, data: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'gemini-admission-'))
    onTestFinished(() => rm(directory, { recursive: true, force: true }))
    const file = join(directory, name)
    await writeFile(file, data)
    return file
  }

  let http: ReturnType<typeof createVertexHttpFixture>
  let uploads: number
  let submitted: number
  const ownedBatchIds: string[] = []
  const createBatch = (file: string, count: number, ids: string) =>
    http.run(() =>
      submitBatch(
        file,
        'topics',
        count,
        ids,
        undefined,
        undefined,
        async () => {},
        () => true,
      ),
    )

  beforeEach(() => {
    http = createVertexHttpFixture()
    uploads = 0
    submitted = 0
    http.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'POST', path: /^\/upload\/storage\/v1\// })
      .reply(200, () => {
        uploads++
        return {}
      })
      .persist()
    http.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({ method: 'POST', path: /\/batchPredictionJobs$/ })
      .reply(200, () => {
        submitted++
        return {
          name: `projects/123456/locations/us/batchPredictionJobs/${randomUUID()}`,
          state: 'JOB_STATE_PENDING',
        }
      })
      .persist()
  })
  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(ownedBatchIds.splice(0))
  })

  it('admits production work after an empty default fixture creates no locks', async () => {
    const user = await createTestUserDirect()
    const entityId = await insertTestTopic({
      name: `admission ${randomUUID()}`,
      slug: `admission-${randomUUID()}`,
      createdById: user.id,
    })
    const { batchId: emptyBatchId } = await createTestBatch()
    expect(await getTestBatchEntities(emptyBatchId)).toEqual([])
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId},${'ab'.repeat(32)}\n`)
    const batchId = await createBatch(inputFile, 1, entityIdsFile)
    ownedBatchIds.push(batchId)
    expect(await getTestBatchEntities(batchId)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
    expect(uploads).toBe(2)
    expect(submitted).toBe(1)
  })

  it('admits separate paid jobs for the same entity without exclusive claims', async () => {
    const user = await createTestUserDirect()
    const entityId = await insertTestTopic({
      name: `admission ${randomUUID()}`,
      slug: `admission-${randomUUID()}`,
      createdById: user.id,
    })
    const inputFile = await writeTempFile('input.jsonl', 'irrelevant for this test')
    const entityIdsFile = await writeTempFile('entity-ids.csv', `${entityId},${'ab'.repeat(32)}\n`)
    const batchId = await createBatch(inputFile, 1, entityIdsFile)
    const duplicateInput = await writeTempFile('input.jsonl', 'independent duplicate job')
    const duplicateIds = await writeTempFile('entity-ids.csv', `${entityId},${'ab'.repeat(32)}\n`)
    const duplicateBatchId = await createBatch(duplicateInput, 1, duplicateIds)
    ownedBatchIds.push(batchId, duplicateBatchId)
    expect(await getTestBatchEntities(batchId)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
    expect(await getTestBatchEntities(duplicateBatchId)).toEqual([
      { entity_type: 'topics', entity_id: entityId },
    ])
    expect(uploads).toBe(4)
    expect(submitted).toBe(2)
  })
})
