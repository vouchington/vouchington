import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  processBatchResultsInBatches,
  processImageBatchResultsInBatches,
} from './result-processing.mts'

const directories: string[] = []

async function writeResults(lines: string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bedrock-results-'))
  directories.push(directory)
  const filePath = join(directory, 'results.jsonl')
  await writeFile(filePath, lines.join('\n'))
  return filePath
}

const hash = 'ab'.repeat(32)

describe('batch result processing', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true })))
  })

  it('collects text embeddings and skips errored, empty, malformed and unparsable lines', async () => {
    const filePath = await writeResults([
      JSON.stringify({
        recordId: JSON.stringify({ entity_id: 'e1', content_sha256: hash }),
        modelOutput: { embedding: [0.1], inputTokenCount: 7 },
      }),
      JSON.stringify({
        recordId: JSON.stringify({ entity_id: 'e2', content_sha256: hash }),
        modelOutput: { embeddings: [{ embedding: [0.2] }] },
      }),
      JSON.stringify({ recordId: 'e3', error: 'failed', modelOutput: { embedding: [0.3] } }),
      JSON.stringify({ recordId: 'e4', modelOutput: {} }),
      JSON.stringify({ recordId: 'not json', modelOutput: { embedding: [0.4] } }),
      '',
      '{broken',
    ])
    const batches: unknown[][] = []

    await processBatchResultsInBatches(filePath, async updates => void batches.push(updates), 1)

    expect(batches).toEqual([
      [
        {
          entity_id: 'e1',
          content_sha256: Buffer.from(hash, 'hex'),
          embedding: [0.1],
          input_token_count: 7,
        },
      ],
      [
        {
          entity_id: 'e2',
          content_sha256: Buffer.from(hash, 'hex'),
          embedding: [0.2],
          input_token_count: null,
        },
      ],
    ])
  })

  it('collects image embeddings and flushes the final partial batch', async () => {
    const filePath = await writeResults([
      JSON.stringify({
        recordId: JSON.stringify({ entity_id: 'i1', image_sha_256: hash }),
        modelOutput: { embedding: [0.5] },
      }),
      JSON.stringify({ recordId: 'bad', modelOutput: { embedding: [0.6] } }),
    ])
    const batches: unknown[][] = []

    await processImageBatchResultsInBatches(filePath, async updates => void batches.push(updates))

    expect(batches).toEqual([
      [{ entity_id: 'i1', image_sha_256: Buffer.from(hash, 'hex'), embedding: [0.5] }],
    ])
  })
})
