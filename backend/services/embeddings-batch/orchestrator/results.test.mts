import { readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { mintUUIDv7 } from '@modules/utils/ids'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { cleanupResultsFile, downloadBatchResults } from './results.mts'

describe('Vertex result download through GCS HTTP', () => {
  const batches: string[] = []
  const files: string[] = []
  async function insertBatch(outputGcsUri?: string) {
    const id = mintUUIDv7()
    batches.push(id)
    await insertTestEmbeddingsBatch({
      id,
      vertexState: 'JOB_STATE_SUCCEEDED',
      batchData: outputGcsUri ? { outputGcsUri } : {},
    })
    return id
  }

  afterEach(async () => {
    await Promise.all(files.splice(0).map(cleanupResultsFile))
    await cleanupTestEmbeddingsBatches(batches.splice(0))
  })
  it('rejects a missing batch or missing output URI before GCS HTTP', async () => {
    const fixture = createVertexHttpFixture()
    const id = await insertBatch()
    await fixture.run(async () => {
      await expect(downloadBatchResults(mintUUIDv7())).rejects.toThrow('output GCS URI')
      await expect(downloadBatchResults(id)).rejects.toThrow('output GCS URI')
    })
  })
  it('rejects output in a bucket other than the configured batch bucket', async () => {
    const fixture = createVertexHttpFixture()
    const id = await insertBatch('gs://other-bucket/output/')
    await fixture.run(async () => {
      await expect(downloadBatchResults(id)).rejects.toThrow('outside the configured batch bucket')
    })
  })
  it('cleans its owned temporary file when a GCS listing fails', async () => {
    const fixture = createVertexHttpFixture()
    const id = await insertBatch('gs://synthetic-embeddings/output/')
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'GET', path: /\/storage\/v1\/b\/synthetic-embeddings\/o\?/ })
      .reply(503, {})
    await fixture.run(async () => {
      await expect(downloadBatchResults(id)).rejects.toThrow('(503)')
    })
    expect(
      (await readdir(tmpdir())).filter(name => name.startsWith(`gemini-batch-results-${id}-`)),
    ).toEqual([])
  })
  it('rejects a successful job with no output objects', async () => {
    const fixture = createVertexHttpFixture()
    const id = await insertBatch('gs://synthetic-embeddings/output/')
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'GET', path: /\/storage\/v1\/b\/synthetic-embeddings\/o\?/ })
      .reply(200, {})
    await fixture.run(async () => {
      await expect(downloadBatchResults(id)).rejects.toThrow('no output objects')
    })
  })
  it('walks GCS pages, ignores non-JSONL objects and separates shard boundaries without buffering the job', async () => {
    const fixture = createVertexHttpFixture()
    const id = await insertBatch('gs://synthetic-embeddings/output/')
    const bucket = fixture.agent.get('https://storage.googleapis.com')
    bucket
      .intercept({
        method: 'GET',
        path: '/storage/v1/b/synthetic-embeddings/o',
        query: { maxResults: '1000', prefix: 'output/' },
      })
      .reply(200, {
        items: [{ name: 'output/a.jsonl' }, { name: 'output/ignored.json' }],
        nextPageToken: 'synthetic-next',
      })
    bucket
      .intercept({
        method: 'GET',
        path: '/storage/v1/b/synthetic-embeddings/o',
        query: { maxResults: '1000', prefix: 'output/', pageToken: 'synthetic-next' },
      })
      .reply(200, { items: [{ name: 'output/b.jsonl' }] })
    bucket
      .intercept({
        method: 'GET',
        path: '/storage/v1/b/synthetic-embeddings/o/output%2Fa.jsonl?alt=media',
      })
      .reply(200, '{"key":"topic:first"}')
    bucket
      .intercept({
        method: 'GET',
        path: '/storage/v1/b/synthetic-embeddings/o/output%2Fb.jsonl?alt=media',
      })
      .reply(200, '{"key":"topic:second"}\n')
    const file = await fixture.run(() => downloadBatchResults(id))
    files.push(file)
    const rows = (await readFile(file, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
    expect(rows).toEqual([{ key: 'topic:first' }, { key: 'topic:second' }])
  })
})
