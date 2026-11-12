import type { VertexBatchResultLine } from './result-parser.mts'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { validateBatchOutput } from './result-manifest.mts'
import { processBatchResultsInBatches } from './result-processing.mts'
import type { BatchUpdateItem } from '@services/embeddings/batch/types'

function output(rows: VertexBatchResultLine[]): AsyncIterable<VertexBatchResultLine> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* rows
    },
  }
}

function success(key = 'post:synthetic-post') {
  return {
    key,
    request: { content: { parts: [{ text: 'title: none | text: body' }] } },
    response: { embedding: { values: Array.from({ length: 1536 }, () => 0.125) } },
  }
}

describe('submitted Vertex output accounting', () => {
  it('rejects missing, duplicate, foreign and malformed successful rows', async () => {
    const manifest = new Map([['post:synthetic-post', Buffer.alloc(32, 1)]])
    await expect(validateBatchOutput(output([]), manifest)).rejects.toThrow('missing')
    await expect(validateBatchOutput(output([success(), success()]), manifest)).rejects.toThrow(
      'duplicate',
    )
    await expect(
      validateBatchOutput(output([success('post:another-post')]), manifest),
    ).rejects.toThrow('Unexpected')
    await expect(
      validateBatchOutput(output([{ key: 'post:synthetic-post', response: {} }]), manifest),
    ).rejects.toThrow('Malformed')
  })

  it('counts provider failures and applies successful rows with the full submitted content hash', async () => {
    const hash = createHash('sha256').update('body'.repeat(3000)).digest()
    const manifest = new Map([
      ['post:synthetic-post', hash],
      ['post:failed-post', Buffer.alloc(32, 2)],
    ])
    const path = output([
      success(),
      { key: 'post:failed-post', status: { code: 429, message: 'capacity' } },
    ])
    await validateBatchOutput(path, manifest)
    await validateBatchOutput(
      output([
        success(),
        { instance: { key: 'post:failed-post' }, error: { code: 429, message: 'capacity' } },
      ]),
      manifest,
    )
    const apply = vi.fn<(items: BatchUpdateItem[]) => Promise<void>>(async () => {})
    await processBatchResultsInBatches(path, apply, 1, 'posts', manifest)
    expect(apply).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ entity_id: 'synthetic-post', content_sha256: hash }),
    ])
  })
})
