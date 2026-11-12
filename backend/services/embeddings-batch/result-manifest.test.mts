import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateBatchOutput } from './result-manifest.mts'
import { processBatchResultsInBatches } from './result-processing.mts'
import type { BatchUpdateItem } from '@services/embeddings/batch/types'

const directories: string[] = []

async function output(rows: unknown[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'gemini-manifest-'))
  directories.push(directory)
  const path = join(directory, 'output.jsonl')
  await writeFile(path, rows.map(row => JSON.stringify(row)).join('\n'))
  return path
}

function success(key = 'post:synthetic-post') {
  return {
    key,
    request: { content: { parts: [{ text: 'title: none | text: body' }] } },
    response: { embedding: { values: Array.from({ length: 1536 }, () => 0.125) } },
  }
}

describe('submitted Vertex output accounting', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })
  it('rejects missing, duplicate, foreign and malformed successful rows', async () => {
    const manifest = new Map([['post:synthetic-post', Buffer.alloc(32, 1)]])
    await expect(validateBatchOutput(await output([]), manifest)).rejects.toThrow('missing')
    await expect(
      validateBatchOutput(await output([success(), success()]), manifest),
    ).rejects.toThrow('duplicate')
    await expect(
      validateBatchOutput(await output([success('post:another-post')]), manifest),
    ).rejects.toThrow('Unexpected')
    await expect(
      validateBatchOutput(await output([{ key: 'post:synthetic-post', response: {} }]), manifest),
    ).rejects.toThrow('Malformed')
  })

  it('counts provider failures and applies successful rows with the full submitted content hash', async () => {
    const hash = createHash('sha256').update('body'.repeat(3000)).digest()
    const manifest = new Map([
      ['post:synthetic-post', hash],
      ['post:failed-post', Buffer.alloc(32, 2)],
    ])
    const path = await output([
      success(),
      { key: 'post:failed-post', status: { code: 429, message: 'capacity' } },
    ])
    await validateBatchOutput(path, manifest)
    await validateBatchOutput(
      await output([
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
