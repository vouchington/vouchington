import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sha256 } from '@modules/utils'
import {
  processBatchResultsInBatches,
  processImageBatchResultsInBatches,
} from './result-processing.mts'
import type { BatchUpdateItem, ImageBatchUpdateItem } from '@services/embeddings/batch/types'

const directories: string[] = []
const vector = new Array(1536).fill(0.125)
async function results(lines: unknown[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'vertex-results-'))
  directories.push(directory)
  const file = join(directory, 'results.jsonl')
  await writeFile(
    file,
    lines.map(line => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n'),
  )
  return file
}
const row = (key = 'topic:id') => ({
  key,
  request: { content: { parts: [{ text: 'title: none | text: original body' }] } },
  response: { tokenCount: '7', embedding: { values: vector } },
})

describe('Vertex batch result ingestion', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true })))
  })
  it('recovers the submitted body hash and provider token count while skipping rejected provider rows', async () => {
    const file = await results([
      row(),
      { key: 'topic:bad', status: { code: 400 } },
      { ...row(), response: { embedding: { values: ['bad'] } } },
    ])
    const saved: BatchUpdateItem[][] = []
    await processBatchResultsInBatches(
      file,
      async updates => {
        saved.push(updates)
      },
      1,
      'topics',
    )
    expect(saved).toEqual([
      [
        {
          entity_id: 'id',
          content_sha256: sha256('original body'),
          embedding: vector,
          input_token_count: 7,
        },
      ],
    ])
  })
  it('preserves the original image hash encoded into its GCS object path', async () => {
    const hash = 'ab'.repeat(32)
    const file = await results([
      {
        key: 'image:id',
        request: {
          content: {
            parts: [{ fileData: { fileUri: `gs://synthetic/job/images/id/${hash}.jpeg` } }],
          },
        },
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
    )
    expect(saved).toEqual([
      [{ entity_id: 'id', image_sha_256: Buffer.from(hash, 'hex'), embedding: vector }],
    ])
  })
  it('propagates an apply failure so the scheduled batch remains retryable', async () => {
    const file = await results([row()])
    await expect(
      processBatchResultsInBatches(
        file,
        async () => {
          throw new Error('synthetic write failure')
        },
        1,
      ),
    ).rejects.toThrow('synthetic write failure')
  })
  it('rejects malformed JSON after an earlier chunk saved rather than acknowledging incomplete ingestion', async () => {
    const file = await results([row(), '{broken'])
    let applied = 0
    await expect(
      processBatchResultsInBatches(
        file,
        async () => {
          applied++
        },
        1,
      ),
    ).rejects.toThrow(SyntaxError)
    expect(applied).toBe(1)
  })
  it('rejects a key for a different table', async () => {
    const file = await results([row('post:id')])
    await expect(
      processBatchResultsInBatches(file, async () => undefined, 1, 'topics'),
    ).rejects.toThrow('wrong entity type')
  })
})
