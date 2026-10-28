import { describe, it, expect } from 'vitest'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import type { S3Client } from '@aws-sdk/client-s3'
import { fetchImageFromS3 } from '../operations.mts'

async function fetchBody(chunks: Buffer[]) {
  const client = {
    send: async () => ({ Body: Readable.from(chunks) }),
  } as unknown as S3Client
  return fetchImageFromS3(client, 'test-bucket', 'image-key')
}

describe('fetchImageFromS3 file body', () => {
  it('spools a stream to a private temporary file', async () => {
    const data = Buffer.from('test data')
    const result = await fetchBody([data])
    try {
      expect(await readFile(result.file!.path)).toEqual(data)
    } finally {
      await result.file!.cleanup()
    }
  })

  it('spools multiple chunks in order', async () => {
    const chunk1 = Buffer.from('hello ')
    const chunk2 = Buffer.from('world')
    const result = await fetchBody([chunk1, chunk2])
    try {
      expect((await readFile(result.file!.path)).toString()).toBe('hello world')
    } finally {
      await result.file!.cleanup()
    }
  })
})
