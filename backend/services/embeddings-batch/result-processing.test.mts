import type { VertexBatchResultLine } from './result-parser.mts'
import { describe, expect, it } from 'vitest'
import { sha256 } from '@modules/utils'
import {
  processBatchResultsInBatches,
  processImageBatchResultsInBatches,
} from './result-processing.mts'
import type { BatchUpdateItem, ImageBatchUpdateItem } from '@services/embeddings/batch/types'

const vector = Array.from({ length: 1536 }, () => 0.125)
function results(lines: VertexBatchResultLine[]): AsyncIterable<VertexBatchResultLine> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* lines
    },
  }
}
const row = (key = 'topic:id') => ({
  key,
  request: { content: { parts: [{ text: 'title: none | text: original body' }] } },
  response: { tokenCount: '7', embedding: { values: vector } },
})

describe('Vertex batch result ingestion', () => {
  it('recovers the submitted body hash and provider token count while skipping rejected provider rows', async () => {
    const hash = sha256('submitted full body')
    const manifest = new Map([
      ['topic:id', hash],
      ['topic:bad', sha256('failed body')],
    ])
    const file = results([row(), { key: 'topic:bad', status: { code: 400 } }])
    const saved: BatchUpdateItem[][] = []
    await processBatchResultsInBatches(
      file,
      async updates => {
        saved.push(updates)
      },
      1,
      'topics',
      manifest,
    )
    expect(saved).toEqual([
      [
        {
          entity_id: 'id',
          content_sha256: hash,
          embedding: vector,
          input_token_count: 7,
        },
      ],
    ])
  })
  it('rejects a malformed successful vector instead of acknowledging incomplete ingestion', async () => {
    const file = results([{ ...row(), response: { embedding: { values: ['bad'] } } }])
    await expect(
      processBatchResultsInBatches(
        file,
        async () => undefined,
        1,
        'topics',
        new Map([['topic:id', sha256('body')]]),
      ),
    ).rejects.toThrow('Malformed successful Vertex batch result')
  })
  it('uses the submitted image hash without inspecting an echoed request', async () => {
    const hash = 'ab'.repeat(32)
    const file = results([
      {
        key: 'image:id',
        response: { embedding: { values: vector } },
      },
    ])
    const saved: ImageBatchUpdateItem[][] = []
    await processImageBatchResultsInBatches(
      file,
      async updates => {
        saved.push(updates)
      },
      1,
      new Map([['image:id', Buffer.from(hash, 'hex')]]),
    )
    expect(saved).toEqual([
      [{ entity_id: 'id', image_sha_256: Buffer.from(hash, 'hex'), embedding: vector }],
    ])
  })
  it('propagates an apply failure so the scheduled batch remains retryable', async () => {
    const file = results([row()])
    await expect(
      processBatchResultsInBatches(
        file,
        async () => {
          throw new Error('synthetic write failure')
        },
        1,
        'topics',
        new Map([['topic:id', sha256('body')]]),
      ),
    ).rejects.toThrow('synthetic write failure')
  })
  it('propagates a late source error after an earlier chunk saved', async () => {
    const file = (async function* () {
      yield row()
      throw new Error('synthetic result source read failure')
    })()
    let applied = 0
    await expect(
      processBatchResultsInBatches(
        file,
        async () => {
          applied++
        },
        1,
        'topics',
        new Map([['topic:id', sha256('body')]]),
      ),
    ).rejects.toThrow('synthetic result source read failure')
    expect(applied).toBe(1)
  })
  it('rejects a key for a different table', async () => {
    const file = results([row('post:id')])
    await expect(
      processBatchResultsInBatches(
        file,
        async () => undefined,
        1,
        'topics',
        new Map([['post:id', sha256('body')]]),
      ),
    ).rejects.toThrow('wrong entity type')
  })
})
