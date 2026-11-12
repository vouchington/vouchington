import { afterEach, describe, expect, it } from 'vitest'
import { mintUUIDv7 } from '@modules/utils/ids'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { getBatchResultSource } from './result-source.mts'
import { streamBatchResults } from './results.mts'

describe('Vertex result generation-pinned GCS streams', () => {
  const batches: string[] = []
  async function insertBatch(outputGcsUri?: string, records = 2) {
    const id = mintUUIDv7()
    batches.push(id)
    await insertTestEmbeddingsBatch({
      id,
      records,
      vertexState: 'JOB_STATE_SUCCEEDED',
      batchData: outputGcsUri ? { outputGcsUri } : {},
    })
    return id
  }
  afterEach(() => cleanupTestEmbeddingsBatches(batches.splice(0)))

  it('rejects absent output and a foreign bucket before HTTP', async () => {
    const fixture = createVertexHttpFixture()
    const absent = await insertBatch()
    const foreign = await insertBatch('gs://other-bucket/output/')
    await fixture.run(async () => {
      await expect(getBatchResultSource(mintUUIDv7())).rejects.toThrow('output GCS URI')
      await expect(getBatchResultSource(absent)).rejects.toThrow('output GCS URI')
      await expect(getBatchResultSource(foreign)).rejects.toThrow('configured batch bucket')
    })
  })

  it.each([
    [{}, 'no output objects'],
    [{ items: [{ name: 'output/a.jsonl', generation: 1, size: '20' }] }, 'generation'],
    [{ items: [{ name: 'other/a.jsonl', generation: '1', size: '20' }] }, 'job prefix'],
    [{ items: [{ name: 'output/a.jsonl', generation: '1', size: '999999999' }] }, 'byte bound'],
    [
      {
        items: Array.from({ length: 2 }, () => ({
          name: 'output/a.jsonl',
          generation: '1',
          size: '20',
        })),
      },
      'Duplicate',
    ],
  ])('rejects invalid result metadata before downloading rows: %j', async (listing, error) => {
    const fixture = createVertexHttpFixture()
    const id = await insertBatch('gs://synthetic-embeddings/output/')
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'GET', path: /\/storage\/v1\/b\/synthetic-embeddings\/o\?/ })
      .reply(200, listing)
    await fixture.run(async () => {
      await expect(getBatchResultSource(id)).rejects.toThrow(error)
    })
  })

  it('captures pages once, ignores empty shards, and replays exact string generations twice', async () => {
    const fixture = createVertexHttpFixture()
    const id = await insertBatch('gs://synthetic-embeddings/output/')
    const bucket = fixture.agent.get('https://storage.googleapis.com')
    bucket.intercept({ method: 'GET', path: /\/o\?(?!.*pageToken=)/ }).reply(200, {
      items: [
        { name: 'output/a.jsonl', generation: '9007199254740993', size: '21' },
        { name: 'output/ignored.json' },
        { name: 'output/empty.jsonl', generation: '2', size: '0' },
      ],
      nextPageToken: 'synthetic-next',
    })
    bucket
      .intercept({ method: 'GET', path: /[?&]pageToken=synthetic-next(?:&|$)/ })
      .reply(200, { items: [{ name: 'output/b.jsonl', generation: '3', size: '22' }] })
    bucket
      .intercept({
        method: 'GET',
        path: '/storage/v1/b/synthetic-embeddings/o/output%2Fa.jsonl?alt=media&generation=9007199254740993',
      })
      .reply(200, '{"key":"topic:first"}')
      .times(2)
    bucket
      .intercept({
        method: 'GET',
        path: '/storage/v1/b/synthetic-embeddings/o/output%2Fb.jsonl?alt=media&generation=3',
      })
      .reply(200, '{"key":"topic:second"}\n')
      .times(2)
    await fixture.run(async () => {
      const source = await getBatchResultSource(id)
      expect(source.objects.map(object => object.generation)).toEqual(['9007199254740993', '3'])
      expect(await collect(streamBatchResults(source))).toEqual([
        { key: 'topic:first' },
        { key: 'topic:second' },
      ])
      expect(await collect(streamBatchResults(source))).toEqual([
        { key: 'topic:first' },
        { key: 'topic:second' },
      ])
    })
  })

  it.each([
    ['{"key":"a"}\n{"key":"b"}\n', 'record count'],
    ['not json\n', 'JSON'],
    [' '.repeat(256 * 1024 + 1), 'line'],
  ])(
    'rejects malformed or excessive output at the streamed HTTP boundary',
    async (body, message) => {
      const fixture = createVertexHttpFixture()
      fixture.agent
        .get('https://storage.googleapis.com')
        .intercept({
          method: 'GET',
          path: '/storage/v1/b/synthetic-embeddings/o/output%2Fa.jsonl?alt=media&generation=1',
        })
        .reply(200, body)
      await fixture.run(async () => {
        const source = {
          objects: [{ name: 'output/a.jsonl', generation: '1', size: 1 }],
          records: 1,
          endpoint: 'https://storage.googleapis.com',
        }
        await expect(collect(streamBatchResults(source))).rejects.toThrow(message)
      })
    },
  )
})

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const rows: T[] = []
  for await (const row of source) rows.push(row)
  return rows
}
